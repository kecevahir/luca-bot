import 'dotenv/config';

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Ortam değişkeni eksik: ${name}. .env dosyasını .env.example'dan kopyalayıp doldurun.`);
  }
  return value;
}

export const config = {
  lucaUrl: required('LUCA_URL', 'https://luca.com.tr'),
  username: required('LUCA_USERNAME'),
  password: required('LUCA_PASSWORD'),
  headless: (process.env.LUCA_HEADLESS ?? 'false').toLowerCase() === 'true',
};
