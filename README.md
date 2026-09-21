# luca-bot

Luca Mali Müşavir Paketi web arayüzünde belirli işlemleri otomatikleştirmek için
Playwright tabanlı bir tarayıcı otomasyon botu.

## Kurulum

```bash
npm install
npx playwright install chromium
cp .env.example .env
# .env içine LUCA_MEMBER_NO / LUCA_USERNAME / LUCA_PASSWORD yaz
```

Test aşamasında `.env` içinde şunlar kalsın:

```
LUCA_HEADLESS=false
LUCA_SLOW_MO=300
LUCA_CONFIRM_CRITICAL=true
LUCA_SCHEDULE=
```

## Güvenli test yolu (hatalı işleme yer vermemek için)

Botu **hemen otonom çalıştırma**. Aşağıdaki sırayı izle; her adımda ekranı
kendin doğrula, emin olmadan bir sonrakine geçme.

### 1) Sadece girişi izle

```bash
npm start -- login-test --watch
```

Tarayıcı görünür açılır, hareketler yavaşlar. Sadece login + oturum kaydı olur;
Luca’da hiçbir iş kaydı yapılmaz.

### 2) İşlemi elle “öğret” (codegen)

```bash
npm run codegen:login
```

Açılan pencerede işlemi **sen** yap. Yandaki kodu kopyalayıp
`src/tasks/ornek-islem.js` olarak kaydet. Kaydet / Onayla / Gönder gibi
tıklamaları `click()` yerine `confirmCritical(...)` ile yaz (şablona bak).

```bash
cp src/tasks/_template.js src/tasks/ornek-islem.js
```

### 3) Dry-run: yolu izle, kritik tıklama UYGULANMASIN

```bash
npm start -- ornek-islem --watch --step --dry-run
```

- `--watch` → ekranı görürsün, yavaş akar  
- `--step` → her `checkpoint`’te Enter’a basmadan ilerlemez  
- `--dry-run` → `confirmCritical` adımları **tıklanmaz** (simülasyon)

Burada menü, form alanları, seçilen firma/dönem doğru mu diye bak.

### 4) Gerçek tıklama ama hâlâ onaylı

```bash
npm start -- ornek-islem --watch --step
```

Kritik adımda terminal sorar: `Bu adımı gerçekten uygula? [e/N]`.  
Şüphen varsa `N` + Enter → işlem iptal, Luca’ya yazılmaz.

### 5) Emin olduktan sonra otonom

```bash
# .env: LUCA_HEADLESS=true, LUCA_CONFIRM_CRITICAL=false (isteğe bağlı)
npm start -- ornek-islem --once
# veya zamanlayıcı
npm start -- ornek-islem --schedule "0 9 * * 1-5"
```

## Komut özeti

| Komut | Ne yapar |
|---|---|
| `--watch` | Görünür + yavaş; zamanlayıcıyı kapatır |
| `--step` | Checkpoint’lerde Enter bekler |
| `--dry-run` | Kritik tıklamaları simüle eder, uygulamaz |
| `--once` | Tek sefer |

## Yeni görev yazarken kural

- Gezinme / form doldurma → normal Playwright  
- **Kaydet / Onayla / Gönder / Sil** → `confirmCritical(page, locator, 'etiket')`  
- Ara doğrulama → `checkpoint(page, 'mesaj')`

## Proje yapısı

```
src/
  config.js       # .env + --watch/--step/--dry-run
  browser.js      # tarayıcı, login, oturum
  safe.js         # checkpoint + confirmCritical
  runner.js       # görev keşfi
  scheduler.js    # every:N / cron
  index.js        # CLI
  tasks/          # her dosya bir görev
```

## Durum

- [x] Proje iskeleti + runner + zamanlayıcı
- [x] Güvenli test modu (`--watch` / `--step` / `--dry-run`)
- [x] Luca giriş alanları (üye no / kullanıcı / parola)
- [ ] Canlı ortamda login doğrulaması (senin makinede `--watch` ile)
- [ ] İlk iş görevi (codegen ile)
