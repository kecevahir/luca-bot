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
  const text = await page.locator('body').innerText().catch(() => '');
  if (/resimdeki karakterleri|güvenlik kodu|captcha/i.test(text)) return true;

  const field = captchaInput(page);
  return field.isVisible({ timeout: 800 }).catch(() => false);
}

function captchaInput(page) {
  return page
    .locator(
      'input[name*="captcha" i], input[id*="captcha" i], input[name*="guvenlik" i], input[id*="guvenlik" i]'
    )
    .or(page.getByRole('textbox').nth(0))
    .first();
}

function captchaImage(page) {
  return page
    .locator('img[src*="captcha" i], img[id*="captcha" i], img[src*="Guvenlik" i], img[src*="guvenlik" i]')
    .or(page.locator('img').filter({ hasNot: page.locator('[src*="logo" i]') }).first())
    .first();
}

function captchaSubmit(page) {
  return page
    .locator('input[type="button"][value="Tamam"], input[type="submit"][value="Tamam"]')
    .or(page.getByRole('button', { name: /^tamam$/i }))
    .first();
}

/**
 * CAPTCHA varsa çözer ve Tamam'a basar. Yoksa no-op.
 */
export async function solveCaptchaIfPresent(page) {
  if (!(await isCaptchaPage(page))) return false;

  console.log('CAPTCHA algılandı — çözüm deneniyor...');
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const shot = path.join(
    ARTIFACTS_DIR,
    `captcha-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
  );

  const img = captchaImage(page);
  let imagePath = shot;
  if (await img.isVisible().catch(() => false)) {
    await img.screenshot({ path: shot }).catch(() => page.screenshot({ path: shot }));
  } else {
    await page.screenshot({ path: shot, fullPage: true });
  }
  console.log('CAPTCHA görseli:', shot);

  let code =
    config.captchaCode ||
    (await solveVia2Captcha(imagePath)) ||
    (await solveViaOcr(imagePath)) ||
    (await askHuman(page, shot));

  code = String(code || '')
    .trim()
    .replace(/\s+/g, '');
  if (!code) {
    throw new Error(
      'CAPTCHA çözülemedi. LUCA_CAPTCHA_API_KEY (2captcha) ekleyin veya --watch ile elle girin.'
    );
  }

  const field = captchaInput(page);
  await field.waitFor({ state: 'visible', timeout: 10000 });
  await field.fill('');
  await field.type(code, { delay: 50 });

  const submit = captchaSubmit(page);
  await submit.click();
  await page.waitForTimeout(1500);

  if (await isCaptchaPage(page)) {
    throw new Error(
      `CAPTCHA kabul edilmedi (denenen: "${code}"). Yenileyip tekrar deneyin veya 2captcha kullanın.`
    );
  }

  console.log('CAPTCHA aşıldı.');
  return true;
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
