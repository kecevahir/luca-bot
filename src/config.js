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

/** Kimlik bilgisi gerektirmeyen ayarlar (liste / yardım için güvenli). */
export const config = {
  lucaUrl: optional(
    'LUCA_URL',
    'https://agiris.luca.com.tr/LUCASSO/giris.erp'
  ),
  totpCode: optional('LUCA_TOTP_CODE'),
  totpSecret: optional('LUCA_TOTP_SECRET'),
  headless: (process.env.LUCA_HEADLESS ?? 'true').toLowerCase() === 'true',
  schedule: optional('LUCA_SCHEDULE'),
  screenshotOnError:
    (process.env.LUCA_SCREENSHOT_ON_ERROR ?? 'true').toLowerCase() === 'true',
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
