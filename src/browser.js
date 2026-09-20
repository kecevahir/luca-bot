import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_STATE_PATH = path.join(__dirname, '..', 'storage-state.json');

/**
 * Tarayıcıyı açar. Daha önce başarılı bir giriş yapılmışsa (storage-state.json
 * varsa) o oturumu geri yükleyerek her seferinde yeniden login olmayı önler.
 */
export async function launchBrowser() {
  const browser = await chromium.launch({ headless: config.headless });
  const contextOptions = { viewport: { width: 1400, height: 900 } };

  const context = await browser
    .newContext({ ...contextOptions, storageState: STORAGE_STATE_PATH })
    .catch(() => browser.newContext(contextOptions));

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Luca'ya giriş yapar. Bu fonksiyondaki seçiciler (selector) taslaktır —
 * gerçek Luca giriş sayfası açıldıktan sonra `npm run codegen` ile kaydedilen
 * adımlara göre güncellenmesi gerekir.
 */
export async function login(page) {
  await page.goto(config.lucaUrl);

  // TODO: Gerçek Luca giriş formunun alan adlarına göre güncelle.
  // Örnek adımlar (yer tutucu):
  // await page.getByLabel('Kullanıcı Adı').fill(config.username);
  // await page.getByLabel('Şifre').fill(config.password);
  // await page.getByRole('button', { name: 'Giriş' }).click();
  // await page.waitForURL('**/anasayfa**');

  throw new Error(
    'login() henüz Luca giriş formuna göre yazılmadı. src/browser.js içindeki TODO kısmını ' +
      "gerçek sayfa elemanlarıyla doldurun (npm run codegen ile kaydedebilirsiniz)."
  );
}

/**
 * Girişten sonra oturumu (çerezler, local storage) diske kaydeder,
 * böylece bir sonraki çalıştırmada tekrar login olmaya gerek kalmaz.
 */
export async function saveSession(context) {
  await context.storageState({ path: STORAGE_STATE_PATH });
}
