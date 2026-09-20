# luca-bot

Luca Mali Müşavir Paketi web arayüzünde belirli işlemleri otomatikleştirmek için
Playwright tabanlı bir tarayıcı otomasyon botu. Görevleri tek sefer veya
zamanlayıcı ile kendi kendine çalıştırabilir.

## Kurulum

```bash
npm install
npx playwright install chromium   # tarayıcı motorunu bir kere indirir
cp .env.example .env               # sonra .env içine gerçek Luca bilgilerini yaz
```

`.env` dosyası asla commit edilmez (`.gitignore` içinde).

Gerekli alanlar:

| Değişken | Açıklama |
|---|---|
| `LUCA_MEMBER_NO` | Üye numarası |
| `LUCA_USERNAME` | Kullanıcı adı |
| `LUCA_PASSWORD` | Parola |
| `LUCA_URL` | Varsayılan: `https://agiris.luca.com.tr/LUCASSO/giris.erp` |
| `LUCA_HEADLESS` | `true` = arka planda (cron için), `false` = görünür |
| `LUCA_SCHEDULE` | Boş = tek sefer; `every:3600` veya cron (`0 9 * * 1-5`) |
| `LUCA_TOTP_SECRET` | 2FA varsa (opsiyonel, `otplib` gerekir) |

## Kullanım

```bash
# Görev listesi
npm start

# Giriş testi (oturumu storage-state.json'a kaydeder)
npm start -- login-test
# veya
npm run login-test

# Her saat başı aynı görevi çalıştır
npm start -- login-test --schedule "every:3600"

# Hafta içi her sabah 09:00
npm start -- login-test --schedule "0 9 * * 1-5"
```

Zamanlayıcıyı systemd / cron ile de sürebilirsin; `LUCA_SCHEDULE` boş bırakıp
dışarıdan periyodik `npm start -- <görev> --once` çağırmak genelde daha sağlamdır.

## Yeni bir işlem "öğretmek"

1. Playwright codegen ile adımları kaydet:

```bash
npm run codegen:login
# veya herhangi bir URL:
npm run codegen -- https://agiris.luca.com.tr/LUCASSO/giris.erp
```

2. Kaydı `src/tasks/` altına yeni bir dosya olarak yapıştır, örneğin
   `src/tasks/bordro-yukle.js`, ve şuna benzer bir iskelet kullan:

```js
export async function run({ page }) {
  // Runner zaten giriş yapmış olur.
  // codegen çıktısını buraya taşı, sabit metinleri config / argüman yap.
  await page.getByText('Örnek Menü').click();
  console.log('bordro-yukle tamam');
}
```

3. Çalıştır:

```bash
npm start -- bordro-yukle
```

## Proje yapısı

```
src/
  config.js       # .env ayarları
  browser.js      # tarayıcı, login, oturum, hata ekran görüntüsü
  runner.js       # görev keşfi / yükleme
  scheduler.js    # every:N veya basit cron
  index.js        # CLI giriş noktası
  tasks/          # her dosya bir görev (export async function run)
```

## Durum

- [x] Proje iskeleti
- [x] Görev runner + zamanlayıcı (kendi kendine çalışma)
- [x] Luca Mali Müşavir giriş URL + üye no / kullanıcı / parola alanları
- [ ] Canlı ortamda login seçicilerinin doğrulanması (bu ağdan `agiris.luca.com.tr` erişilemeyebilir)
- [ ] İlk iş görevi (ör. puantaj / bordro yükleme) — codegen ile eklenecek
- [ ] 2FA / sanal klavye gerekirse ince ayar
