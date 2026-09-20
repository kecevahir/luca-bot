# luca-bot

Luca Mali Müşavir Paketi web arayüzünde belirli işlemleri otomatikleştirmek için
Playwright tabanlı bir tarayıcı otomasyon botu.

## Kurulum

```bash
npm install
npx playwright install chromium   # tarayıcı motorunu bir kere indirir
cp .env.example .env               # sonra .env içine gerçek Luca bilgilerini yaz
```

`.env` dosyası asla commit edilmez (`.gitignore` içinde).

## Kullanım

```bash
npm run login-test
```

## Yeni bir işlem "öğretmek"

Bota yeni bir işlem öğretmenin en kolay yolu, Playwright'ın kayıt (codegen)
aracını kullanmaktır. Bu araç, tarayıcıda yaptığın her tıklama ve yazma
işlemini otomatik olarak koda çevirir:

```bash
npm run codegen -- https://luca.com.tr
```

Açılan tarayıcı penceresinde işlemi elle yap (giriş yap, ilgili menüye git,
formu doldur vb.). Yandaki pencerede oluşan kodu kopyalayıp `src/tasks/`
altında yeni bir dosyaya (örn. `src/tasks/bordro-yukle.js`) yapıştır, sonra
`src/browser.js` içindeki `login()` ve ortak yardımcı fonksiyonları kullanacak
şekilde düzenle.

## Proje yapısı

```
src/
  config.js       # .env'den ayarları okur
  browser.js      # tarayıcı açma, giriş yapma, oturum kaydetme
  tasks/          # her biri tek bir iş yapan script'ler (login-test, ...)
  index.js        # giriş noktası / görev listesi
```

## Durum

- [x] Proje iskeleti
- [ ] Gerçek Luca giriş formu seçicileri (`src/browser.js` içindeki `login()`)
- [ ] İlk otomatik işlem (ör. puantaj/bordro yükleme)
