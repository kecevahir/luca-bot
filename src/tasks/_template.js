/**
 * Yeni görev şablonu.
 *
 * Kopyala:  cp src/tasks/_template.js src/tasks/bordro-yukle.js
 * Sonra codegen çıktısını run() içine taşı.
 *
 * Dosya adındaki _ öneki runner tarafından yok sayılır.
 */

export async function run({ page }) {
  // Örnek:
  // await page.getByRole('link', { name: 'Bordro' }).click();
  // await page.getByLabel('Dönem').fill('2026-09');
  // await page.getByRole('button', { name: 'Kaydet' }).click();
  console.log('_template: buraya gerçek işlem adımlarını yazın.');
  void page;
}
