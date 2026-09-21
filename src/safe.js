import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from './config.js';

/**
 * Test aşamasında güvenli izleme yardımcıları.
 *
 * --watch  → görünür tarayıcı + yavaş hareket
 * --step   → her checkpoint'te Enter bekle (veya Playwright Inspector)
 *
 * Kritik kayıt/gönder adımlarında mutlaka confirmCritical() kullan.
 */

export function isWatchMode() {
  return Boolean(config.watch);
}

export function isStepMode() {
  return Boolean(config.step);
}

/**
 * Ara kontrol noktası. --step yoksa sadece log yazar.
 * --step varken terminalde Enter bekler; PWDEBUG=1 ise page.pause() açar.
 */
export async function checkpoint(page, message) {
  const line = `⏸  ${message}`;
  console.log(line);

  if (!isStepMode()) return;

  if (process.env.PWDEBUG === '1' && page) {
    console.log('   Playwright Inspector açık — Continue ile devam et.');
    await page.pause();
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question('   Devam için Enter, iptal için Ctrl+C ... ');
  } finally {
    rl.close();
  }
}

/**
 * Kaydet / Onayla / Gönder gibi geri alınamaz tıklamalardan önce onay ister.
 * dryRun veya watch+step modunda varsayılan olarak sorar.
 * Onaylanmazsa tıklamaz ve hata fırlatır (görev güvenli şekilde durur).
 */
export async function confirmCritical(page, locator, label) {
  const mustAsk = config.dryRun || isWatchMode() || isStepMode() || config.confirmCritical;

  if (config.dryRun) {
    console.log(`🛑 DRY-RUN: "${label}" tıklanMADI (simülasyon).`);
    await checkpoint(page, `Dry-run kontrolü: ${label}`);
    return false;
  }

  if (!mustAsk) {
    await locator.click();
    return true;
  }

  console.log(`⚠️  Kritik adım: ${label}`);
  const rl = readline.createInterface({ input, output });
  let answer = '';
  try {
    answer = (
      await rl.question('   Bu adımı gerçekten uygula? [e/N] ')
    )
      .trim()
      .toLowerCase();
  } finally {
    rl.close();
  }

  if (answer !== 'e' && answer !== 'evet' && answer !== 'y' && answer !== 'yes') {
    throw new Error(`Kritik adım iptal edildi: ${label}`);
  }

  await locator.click();
  console.log(`✓ Uygulandı: ${label}`);
  return true;
}
