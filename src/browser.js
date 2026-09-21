import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, getCredentials } from './config.js';
import { solveCaptchaIfPresent, isCaptchaPage } from './captcha.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storage-state.json');
export const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

/**
 * Tarayıcıyı açar. storage-state.json varsa önceki oturumu geri yükler.
 * --watch / LUCA_SLOW_MO ile hareketler yavaşlatılır (gözle takip için).
 */
export async function launchBrowser() {
  const slowMo = config.watch
    ? Math.max(config.slowMo || 0, 250)
    : config.slowMo || 0;

  if (!config.headless) {
    console.log(
      `Tarayıcı görünür açılıyor` +
        (slowMo ? ` (slowMo=${slowMo}ms)` : '') +
        (config.dryRun ? ' [DRY-RUN]' : '') +
        (config.step ? ' [STEP]' : '')
    );
  }

  const browser = await chromium.launch({
    headless: config.headless,
    slowMo,
  });
  const contextOptions = { viewport: { width: 1400, height: 900 } };

  let context;
  try {
    await fs.access(STORAGE_STATE_PATH);
    context = await browser.newContext({
      ...contextOptions,
      storageState: STORAGE_STATE_PATH,
    });
  } catch {
    context = await browser.newContext(contextOptions);
  }

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Oturum diske kayıtlı mı?
 */
export async function hasSavedSession() {
  try {
    await fs.access(STORAGE_STATE_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sayfada hâlâ giriş formu var mı? (oturum düşmüş mü kontrolü)
 */
export async function isLoginPage(page) {
  const url = page.url();
  if (/giris\.erp|login/i.test(url)) return true;

  // Gerçek form alanları: #musteriNo, #kullaniciAdi, #parola
  const memberField = page.locator('#musteriNo, input[name="musteriNo"]').first();

  try {
    return await memberField.isVisible({ timeout: 1500 });
  } catch {
    return false;
  }
}

/**
 * Luca Mali Müşavir ortak giriş sayfasına giriş yapar.
 * Akış: (opsiyonel ön CAPTCHA) → form → GİRİŞ → (CAPTCHA) → (2FA)
 */
export async function login(page) {
  const creds = getCredentials();
  await page.goto(config.lucaUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);

  // Bazen (rate-limit / VPN IP) önce CAPTCHA gelir
  if (await isCaptchaPage(page)) {
    console.log('Giriş formu öncesi CAPTCHA var — önce çözülüyor...');
    await solveCaptchaIfPresent(page);
    await page.waitForTimeout(1000);
  }

  // CAPTCHA sonrası hâlâ form yoksa "Luca Giriş Ekranı" linkine git
  let member = page.locator('#musteriNo, input[name="musteriNo"]').first();
  if (!(await member.isVisible({ timeout: 3000 }).catch(() => false))) {
    const back = page.getByText(/luca giriş ekranı/i).first();
    if (await back.isVisible().catch(() => false)) {
      await back.click();
      await page.waitForTimeout(1500);
    }
    // Yeniden yükle
    if (!(await member.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.goto(config.lucaUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);
      if (await isCaptchaPage(page)) {
        await solveCaptchaIfPresent(page);
      }
    }
  }

  member = page.locator('#musteriNo, input[name="musteriNo"]').first();
  const username = page.locator('#kullaniciAdi, input[name="kullaniciAdi"]').first();
  const password = page.locator('#parola, input[name="parola"]').first();

  await member.waitFor({ state: 'visible', timeout: 45000 });
  console.log('Giriş formu görünür — bilgiler dolduruluyor...');
  await member.fill(creds.memberNo);
  await username.fill(creds.username);
  await password.fill(creds.password);

  // type="button" + onClick="girisbtn();" — klasik submit değil
  const submit = page.locator('input[type="button"][value="GİRİŞ"], input[type="button"][value="Giris"]').first();
  await submit.click();

  // CAPTCHA (sık çıkar) — otonom: 2captcha / OCR / insan
  await page.waitForTimeout(1200);
  await solveCaptchaIfPresent(page);

  // İsteğe bağlı 2FA
  const totp = await resolveTotpCode();
  if (totp) {
    const totpField = page
      .getByLabel(/doğrulama|kod|authenticator|2fa|otp/i)
      .or(page.getByPlaceholder(/doğrulama|kod|otp/i))
      .or(page.locator('input[name*="otp" i], input[id*="otp" i]').first());

    const visible = await totpField.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      await totpField.fill(totp);
      const confirm = page.getByRole('button', { name: /tamam|doğrula|giriş|giris/i });
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      }
    }
  }

  // CAPTCHA sonrası tekrar çıkabilir / hata diyaloğu
  await page.waitForTimeout(800);
  if (await isCaptchaPage(page)) {
    await solveCaptchaIfPresent(page);
  }

  // Giriş formunun / captcha'nın kaybolmasını bekle
  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || '';
        const onGiris = /giris\.erp/i.test(location.href);
        const captcha = /resimdeki karakterleri|güvenlik kodu/i.test(t);
        const loginForm = !!document.querySelector('#musteriNo');
        return !(onGiris && (captcha || loginForm));
      },
      null,
      { timeout: 90000 }
    )
    .catch(() => {});

  if ((await isLoginPage(page)) || (await isCaptchaPage(page))) {
    throw new Error(
      'Giriş başarısız görünüyor — hâlâ giriş/CAPTCHA sayfasındayız. ' +
        'Üye no / kullanıcı / parola doğru mu? CAPTCHA için LUCA_CAPTCHA_API_KEY ' +
        'veya --watch ile elle çözüm gerekir.'
    );
  }
}

async function resolveTotpCode() {
  if (config.totpCode) return config.totpCode;
  if (!config.totpSecret) return '';

  try {
    const { authenticator } = await import('otplib');
    return authenticator.generate(config.totpSecret);
  } catch {
    throw new Error(
      'LUCA_TOTP_SECRET tanımlı ama otplib yok. `npm install otplib` çalıştırın ' +
        'veya tek seferlik LUCA_TOTP_CODE kullanın.'
    );
  }
}

/**
 * Kayıtlı oturum varsa kullan; yoksa veya düşmüşse yeniden login ol.
 */
export async function ensureLoggedIn(page, context) {
  if (await hasSavedSession()) {
    await page.goto(config.lucaUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    if (!(await isLoginPage(page))) {
      console.log('Mevcut oturum geçerli, yeniden giriş atlandı.');
      return;
    }
    console.log('Kayıtlı oturum düşmüş, yeniden giriş yapılıyor...');
  } else {
    console.log('Kayıtlı oturum yok, giriş yapılıyor...');
  }

  await login(page);
  await saveSession(context);
  console.log('Giriş başarılı, oturum kaydedildi.');
}

export async function saveSession(context) {
  await context.storageState({ path: STORAGE_STATE_PATH });
}

/**
 * Hata anında artifacts/ altına ekran görüntüsü alır.
 */
export async function captureErrorScreenshot(page, label = 'error') {
  if (!config.screenshotOnError || !page) return null;
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ARTIFACTS_DIR, `${label}-${stamp}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => null);
  return file;
}
