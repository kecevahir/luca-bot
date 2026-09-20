import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, getCredentials } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storage-state.json');
export const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

/**
 * Tarayıcıyı açar. storage-state.json varsa önceki oturumu geri yükler.
 */
export async function launchBrowser() {
  const browser = await chromium.launch({ headless: config.headless });
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

  const memberField = page
    .getByLabel(/üye\s*numaras[ıi]/i)
    .or(page.locator('input[name*="uye" i], input[id*="uye" i]').first());

  try {
    return await memberField.isVisible({ timeout: 1500 });
  } catch {
    return false;
  }
}

/**
 * Luca Mali Müşavir ortak giriş sayfasına giriş yapar.
 * Alanlar: Üye Numarası, Kullanıcı Adı, Parola (+ isteğe bağlı 2FA).
 */
export async function login(page) {
  const creds = getCredentials();
  await page.goto(config.lucaUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const member = page
    .getByLabel(/üye\s*numaras[ıi]/i)
    .or(page.getByPlaceholder(/üye\s*numaras[ıi]/i))
    .or(page.locator('input[name*="uye" i], input[id*="uye" i]').first());

  const username = page
    .getByLabel(/kullan[ıi]c[ıi]\s*ad[ıi]/i)
    .or(page.getByPlaceholder(/kullan[ıi]c[ıi]\s*ad[ıi]/i))
    .or(
      page
        .locator(
          'input[name*="kullanici" i], input[id*="kullanici" i], input[name*="user" i]'
        )
        .first()
    );

  const password = page
    .getByLabel(/parola|şifre|sifre/i)
    .or(page.getByPlaceholder(/parola|şifre|sifre/i))
    .or(page.locator('input[type="password"]').first());

  await member.waitFor({ state: 'visible', timeout: 30000 });
  await member.fill(creds.memberNo);
  await username.fill(creds.username);
  await password.fill(creds.password);

  const submit = page
    .getByRole('button', { name: /giriş|giris|tamam|login/i })
    .or(page.locator('input[type="submit"], button[type="submit"]').first());

  await submit.click();

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

  // Giriş formunun kaybolmasını bekle
  await page
    .waitForFunction(
      () => !/giris\.erp/i.test(location.href),
      null,
      { timeout: 30000 }
    )
    .catch(() => {});

  if (await isLoginPage(page)) {
    throw new Error(
      'Giriş başarısız görünüyor — hâlâ giriş sayfasındayız. ' +
        'Üye no / kullanıcı / parola doğru mu? 2FA gerekiyorsa LUCA_TOTP_SECRET ayarlayın. ' +
        'Luca sanal klavye zorunlu kılıyorsa codegen ile adımları kaydedip login() güncelleyin.'
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
