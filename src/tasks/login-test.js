import { launchBrowser, login, saveSession } from '../browser.js';

/**
 * Giriş akışını test etmek için kullanılan basit görev.
 * Çalıştır: npm run login-test
 */
async function main() {
  const { browser, context, page } = await launchBrowser();

  try {
    await login(page);
    await saveSession(context);
    console.log('Giriş başarılı, oturum kaydedildi.');
  } catch (err) {
    console.error('Giriş başarısız:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
