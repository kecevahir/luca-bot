import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, ensureLoggedIn, captureErrorScreenshot } from '../browser.js';

/**
 * Giriş akışını test eder ve oturumu kaydeder.
 *
 * Doğrudan:  npm run login-test
 * Runner ile: npm start -- login-test
 */
export async function run(ctx = {}) {
  if (ctx.page && ctx.context) {
    // Runner zaten ensureLoggedIn çağırdı
    console.log('Oturum hazır (login-test).');
    return;
  }

  const { browser, context, page } = await launchBrowser();
  try {
    await ensureLoggedIn(page, context);
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
