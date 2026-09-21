import 'dotenv/config';

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Ortam değişkeni eksik: ${name}. .env dosyasını .env.example'dan kopyalayıp doldurun.`
    );
  }
  return value;
}

function optional(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function bool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true';
}

/** CLI flag'leriyle runtime'da ezilebilir ayarlar. */
const runtime = {
  watch: false,
  step: false,
  dryRun: false,
};

export function applyRuntimeFlags({ watch = false, step = false, dryRun = false } = {}) {
  runtime.watch = watch || bool('LUCA_WATCH', false);
  runtime.step = step || bool('LUCA_STEP', false);
  runtime.dryRun = dryRun || bool('LUCA_DRY_RUN', false);

  // İzleme / adım / dry-run → headless kapalı
  if (runtime.watch || runtime.step || runtime.dryRun) {
    config.headless = false;
  }
}

/** Kimlik bilgisi gerektirmeyen ayarlar (liste / yardım için güvenli). */
export const config = {
  lucaUrl: optional(
    'LUCA_URL',
    'https://agiris.luca.com.tr/LUCASSO/giris.erp'
  ),
  totpCode: optional('LUCA_TOTP_CODE'),
  totpSecret: optional('LUCA_TOTP_SECRET'),
  // CAPTCHA: 2captcha API key → otonom; yoksa insan / OCR
  captchaApiKey: optional('LUCA_CAPTCHA_API_KEY'),
  captchaCode: optional('LUCA_CAPTCHA_CODE'),
  captchaOcr: bool('LUCA_CAPTCHA_OCR', true),
  // Test aşamasında false önerilir; üretim/cron için true
  headless: bool('LUCA_HEADLESS', false),
  slowMo: Number(process.env.LUCA_SLOW_MO ?? '0') || 0,
  schedule: optional('LUCA_SCHEDULE'),
  screenshotOnError: bool('LUCA_SCREENSHOT_ON_ERROR', true),
  confirmCritical: bool('LUCA_CONFIRM_CRITICAL', true),
  get watch() {
    return runtime.watch || bool('LUCA_WATCH', false);
  },
  get step() {
    return runtime.step || bool('LUCA_STEP', false);
  },
  get dryRun() {
    return runtime.dryRun || bool('LUCA_DRY_RUN', false);
  },
};

/**
 * Login için gerekli alanları okur; eksikse anlamlı hata fırlatır.
 * Görev listesi / --help bu fonksiyonu çağırmaz.
 */
export function getCredentials() {
  return {
    memberNo: required('LUCA_MEMBER_NO'),
    username: required('LUCA_USERNAME'),
    password: required('LUCA_PASSWORD'),
  };
}
