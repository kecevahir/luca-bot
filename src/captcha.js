import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

/**
 * Luca CAPTCHA ekranı: "Lütfen resimdeki karakterleri giriniz."
 *
 * Gerçekçi otonomi:
 * 1) Kayıtlı oturum varsa CAPTCHA çoğu zaman hiç çıkmaz
 * 2) LUCA_CAPTCHA_API_KEY (2captcha) varsa bot çözer
 * 3) Yerel OCR dener (zayıf — bozuk CAPTCHA'da sık fail)
 * 4) Son çare: terminalden / izleme modunda insan girer
 */

export async function isCaptchaPage(page) {
  // Sadece metin — login formundaki textbox'a bakmak yanlış pozitif verir
  const text = await page.locator('body').innerText().catch(() => '');
  return /resimdeki karakterleri\s*giriniz|güvenlik kodu/i.test(text);
}

function captchaInput(page) {
  // Önce adlandırılmış alanlar; yoksa "Tamam" butonunun üstündeki tek text input
  return page
    .locator(
      'input[name*="captcha" i], input[id*="captcha" i], input[name*="guvenlik" i], input[id*="guvenlik" i], input[name*="kod" i], input[id*="kod" i]'
    )
    .or(
      page
        .locator('input[type="text"]:visible')
        .filter({ hasNot: page.locator('#musteriNo, #kullaniciAdi, [name="musteriNo"], [name="kullaniciAdi"]') })
        .first()
    )
    .first();
}

function captchaImage(page) {
  // Önce açık adaylar
  const named = page.locator(
    'img[src*="captcha" i], img[id*="captcha" i], img[src*="Guvenlik" i], img[src*="guvenlik" i], img[src*="kod" i]'
  );
  return named.first();
}

async function captureCaptchaImage(page, destPath) {
  // İsimli img
  const named = captchaImage(page);
  if (await named.isVisible().catch(() => false)) {
    await named.screenshot({ path: destPath });
    return destPath;
  }

  // Metnin üstündeki / yakındaki img — en geniş küçük-orta boy görsel
  const best = await page.evaluate(() => {
    const imgs = [...document.images]
      .map((img, idx) => ({
        idx,
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height,
        src: img.src,
      }))
      .filter((i) => i.w >= 80 && i.w <= 500 && i.h >= 30 && i.h <= 200);
    imgs.sort((a, b) => b.w * b.h - a.w * a.h);
    return imgs[0]?.idx ?? -1;
  });

  if (best >= 0) {
    await page.locator('img').nth(best).screenshot({ path: destPath });
    return destPath;
  }

  await page.screenshot({ path: destPath, fullPage: true });
  return destPath;
}

function captchaSubmit(page) {
  return page
    .locator('input[type="button"][value="Tamam"], input[type="submit"][value="Tamam"]')
    .or(page.getByRole('button', { name: /^tamam$/i }))
    .first();
}

/**
 * CAPTCHA varsa çözer ve Tamam'a basar. Yoksa no-op.
 * Luca CAPTCHA'ları genelde küçük harf; 2captcha bazen karıştırır → toLowerCase.
 * Yanlış cevapta yenile + tekrar dene (max 5).
 */
export async function solveCaptchaIfPresent(page) {
  if (!(await isCaptchaPage(page))) return false;

  console.log('CAPTCHA algılandı — çözüm deneniyor...');
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

  const maxAttempts = 5;
  let lastCode = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await dismissErrorDialog(page);

    if (!(await isCaptchaPage(page))) {
      console.log('CAPTCHA ekranı kapandı.');
      return true;
    }

    if (attempt > 1) {
      await refreshCaptchaImage(page);
      await page.waitForTimeout(800);
    }

    const shot = path.join(
      ARTIFACTS_DIR,
      `captcha-${Date.now()}-try${attempt}.png`
    );
    await captureCaptchaImage(page, shot).catch(() =>
      page.screenshot({ path: shot, fullPage: true })
    );
    console.log(`CAPTCHA görseli (deneme ${attempt}/${maxAttempts}):`, shot);

    let code =
      (attempt === 1 && config.captchaCode) ||
      (await solveVia2Captcha(shot)) ||
      (await solveViaOcr(shot)) ||
      '';

    // Luca görselleri küçük harf ağırlıklı
    code = String(code || '')
      .trim()
      .replace(/\s+/g, '')
      .toLowerCase();
    lastCode = code;

    if (!code) {
      console.log('Bu denemede kod alınamadı, yenileniyor...');
      continue;
    }

    console.log(`CAPTCHA kodu denenecek: ${code}`);
    const field = captchaInput(page);
    await field.waitFor({ state: 'visible', timeout: 10000 });
    await field.click({ clickCount: 3 }).catch(() => {});
    await field.fill('');
    await field.fill(code);

    const submit = captchaSubmit(page);
    await submit.click({ noWaitAfter: true });
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await dismissErrorDialog(page);

    if (!(await isCaptchaPage(page))) {
      console.log('CAPTCHA aşıldı.');
      return true;
    }

    console.log(`CAPTCHA reddedildi (${code}), tekrar denenecek...`);
  }

  // Son çare insan
  if (config.watch || config.step || !config.headless) {
    const human = await askHuman(page, path.join(ARTIFACTS_DIR, 'captcha-human.png'));
    if (human) {
      const code = String(human).trim().replace(/\s+/g, '').toLowerCase();
      const field = captchaInput(page);
      await field.fill(code);
      await captchaSubmit(page).click({ noWaitAfter: true });
      await page.waitForTimeout(1500);
      if (!(await isCaptchaPage(page))) {
        console.log('CAPTCHA aşıldı (insan).');
        return true;
      }
    }
  }

  throw new Error(
    `CAPTCHA ${maxAttempts} denemede aşılamadı (son: "${lastCode}"). ` +
      '2captcha bakiyesi / görsel kalitesi kontrol edin.'
  );
}

async function dismissErrorDialog(page) {
  // sweetAlert "HATA" / "Lütfen resmi yenileyin" → TAMAM
  const btn = page.locator(
    'button.confirm, .sweet-alert button.confirm, button:has-text("TAMAM"), button:has-text("Tamam")'
  ).first();
  if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
    await btn.click({ noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function refreshCaptchaImage(page) {
  // Yenile ikonu — title/alt/class veya captcha img yanındaki clickable
  const candidates = [
    page.locator('img[onclick*="yenile" i], a[onclick*="yenile" i], img[src*="refresh" i]'),
    page.locator('[title*="Yenile" i], [alt*="Yenile" i]'),
    page.getByRole('link', { name: /yenile/i }),
  ];
  for (const loc of candidates) {
    const el = loc.first();
    if (await el.isVisible({ timeout: 300 }).catch(() => false)) {
      await el.click({ noWaitAfter: true }).catch(() => {});
      return;
    }
  }
  // Fallback: captcha img'ye tıklamak bazen yeniler; yoksa sayfa reload etme
}

async function askHuman(page, shotPath) {
  console.log('');
  console.log('=== CAPTCHA — insan girişi ===');
  console.log('Görsel:', shotPath);
  console.log('Remote desktop’ta karakterleri okuyup buraya yazabilirsin.');
  console.log('');

  // İzleme modunda kullanıcı masaüstünden de doldurup Enter basabilir
  if (config.watch || config.step || !config.headless) {
    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question(
        'CAPTCHA kodunu yaz (veya masaüstünde doldurduysan boş bırakıp Enter): '
      );
      if (answer.trim()) return answer.trim();

      // Boş: kullanıcı formu kendisi doldurmuş olabilir — Tamam'a basmayı dene
      const field = captchaInput(page);
      const existing = await field.inputValue().catch(() => '');
      if (existing.trim()) return existing.trim();

      // Hâlâ boşsa tekrar sor
      const again = await rl.question('Kod boş — CAPTCHA karakterlerini yaz: ');
      return again.trim();
    } finally {
      rl.close();
    }
  }

  throw new Error(
    'Headless otonom çalıştırmada CAPTCHA için LUCA_CAPTCHA_API_KEY gerekli (2captcha.com).'
  );
}

async function solveViaOcr(imagePath) {
  if (!config.captchaOcr) return '';
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync(
      'tesseract',
      [imagePath, 'stdout', '-c', 'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', '--psm', '7'],
      { timeout: 15000 }
    );
    const code = String(stdout || '')
      .trim()
      .replace(/[^A-Za-z0-9]/g, '');
    if (code.length >= 3) {
      console.log('OCR tahmini:', code);
      return code;
    }
  } catch (err) {
    console.log('OCR kullanılamadı:', err.message?.slice?.(0, 120) || err);
  }
  return '';
}

/**
 * 2Captcha ImageToText — https://2captcha.com
 * Env: LUCA_CAPTCHA_API_KEY
 */
async function solveVia2Captcha(imagePath) {
  const key = config.captchaApiKey;
  if (!key) return '';

  console.log('2Captcha ile çözülüyor...');
  const buf = await fs.readFile(imagePath);
  const body = new URLSearchParams({
    key,
    method: 'base64',
    body: buf.toString('base64'),
    json: '1',
  });

  const createRes = await fetch('https://2captcha.com/in.php', {
    method: 'POST',
    body,
  });
  const createJson = await createRes.json();
  if (createJson.status !== 1) {
    console.log('2Captcha gönderim hatası:', createJson);
    return '';
  }

  const id = createJson.request;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(
      `https://2captcha.com/res.php?key=${encodeURIComponent(key)}&action=get&id=${encodeURIComponent(id)}&json=1`
    );
    const pollJson = await poll.json();
    if (pollJson.status === 1) {
      console.log('2Captcha sonuç:', pollJson.request);
      return String(pollJson.request);
    }
    if (pollJson.request !== 'CAPCHA_NOT_READY') {
      console.log('2Captcha hata:', pollJson);
      return '';
    }
  }
  console.log('2Captcha zaman aşımı');
  return '';
}
