import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, ensureLoggedIn, captureErrorScreenshot } from '../browser.js';
import { checkpoint } from '../safe.js';

/**
 * Giriş akışını test eder ve oturumu kaydeder.
 * Güvenli izleme: npm start -- login-test --watch
 */
export async function run(ctx = {}) {
  if (ctx.page && ctx.context) {
    await checkpoint(ctx.page, 'Giriş tamam — oturum hazır (login-test)');
    console.log('Oturum hazır (login-test). Luca’da iş kaydı yapılmadı.');
    return;
  }

  const { browser, context, page } = await launchBrowser();
  try {
    await ensureLoggedIn(page, context);
    await checkpoint(page, 'Giriş tamam — tarayıcıyı kontrol et, sonra Enter');
    console.log('Oturum hazır (login-test). Luca’da iş kaydı yapılmadı.');
  } catch (err) {
    const shot = await captureErrorScreenshot(page, 'login-test');
    console.error('Giriş başarısız:', err.message);
    if (shot) console.error('Ekran görüntüsü:', shot);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  run();
}
