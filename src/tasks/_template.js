/**
 * Yeni görev şablonu — güvenli test dostu.
 *
 * Kopyala:  cp src/tasks/_template.js src/tasks/bordro-yukle.js
 * Sonra codegen çıktısını run() içine taşı.
 *
 * Dosya adındaki _ öneki runner tarafından yok sayılır.
 *
 * Test sırası:
 *   npm start -- bordro-yukle --watch --step --dry-run
 *   npm start -- bordro-yukle --watch --step
 *   npm start -- bordro-yukle
 */

import { checkpoint, confirmCritical } from '../safe.js';

export async function run({ page }) {
  // 1) Menüye git — izlenebilir ara nokta
  await checkpoint(page, 'Menüye gitmeden önce kontrol et');
  // await page.getByRole('link', { name: 'Bordro' }).click();

  // 2) Formu doldur (geri alınabilir alanlar — doğrudan fill OK)
  // await page.getByLabel('Dönem').fill('2026-09');
  await checkpoint(page, 'Form dolduruldu — Kaydet öncesi ekranı kontrol et');

  // 3) Geri alınamaz adım — MUTLAKA confirmCritical kullan
  // await confirmCritical(
  //   page,
  //   page.getByRole('button', { name: 'Kaydet' }),
  //   'Bordro Kaydet'
  // );

  console.log('_template: codegen adımlarını yukarıya taşıyın.');
  void confirmCritical;
  void page;
}
