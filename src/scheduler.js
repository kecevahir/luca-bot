/**
 * Basit zamanlayıcı.
 *
 * Desteklenen biçimler:
 * - "every:3600"  → her N saniyede bir
 * - cron ifadesi  → "m h dom mon dow" (5 alan, saniye yok)
 *   Örn. "0 9 * * 1-5"  hafta içi 09:00 (yerel saat)
 */

function parseCronField(field, min, max) {
  if (field === '*') {
    return { type: 'any' };
  }
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error(`Geçersiz cron adımı: ${field}`);
    }
    return { type: 'step', step };
  }
  if (field.includes(',')) {
    return {
      type: 'list',
      values: field.split(',').map((v) => Number(v.trim())),
    };
  }
  if (field.includes('-')) {
    const [a, b] = field.split('-').map(Number);
    return { type: 'range', from: a, to: b };
  }
  const n = Number(field);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`Geçersiz cron değeri: ${field} (beklenen ${min}-${max})`);
  }
  return { type: 'exact', value: n };
}

function matchField(parsed, value) {
  switch (parsed.type) {
    case 'any':
      return true;
    case 'exact':
      return value === parsed.value;
    case 'list':
      return parsed.values.includes(value);
    case 'range':
      return value >= parsed.from && value <= parsed.to;
    case 'step':
      return value % parsed.step === 0;
    default:
      return false;
  }
}

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Cron ifadesi 5 alan olmalı (m h dom mon dow), alınan: "${expr}"`
    );
  }
  const [m, h, dom, mon, dow] = parts;
  return {
    minute: parseCronField(m, 0, 59),
    hour: parseCronField(h, 0, 23),
    dom: parseCronField(dom, 1, 31),
    mon: parseCronField(mon, 1, 12),
    dow: parseCronField(dow, 0, 6),
  };
}

function cronMatches(cron, date = new Date()) {
  return (
    matchField(cron.minute, date.getMinutes()) &&
    matchField(cron.hour, date.getHours()) &&
    matchField(cron.dom, date.getDate()) &&
    matchField(cron.mon, date.getMonth() + 1) &&
    matchField(cron.dow, date.getDay())
  );
}

/**
 * schedule boşsa job'ı bir kez çalıştırır.
 * Aksi halde sonsuz döngüde zamanlamaya göre çalıştırır.
 */
export async function runScheduled(schedule, job) {
  if (!schedule) {
    await job();
    return;
  }

  if (schedule.startsWith('every:')) {
    const seconds = Number(schedule.slice('every:'.length));
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`Geçersiz aralık: ${schedule}`);
    }
    console.log(`Zamanlayıcı: her ${seconds} sn`);
    // İlk çalıştırma hemen
    await job();
    for (;;) {
      await sleep(seconds * 1000);
      await job();
    }
  }

  const cron = parseCron(schedule);
  console.log(`Zamanlayıcı (cron): ${schedule}`);
  let lastKey = '';

  for (;;) {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (cronMatches(cron, now) && key !== lastKey) {
      lastKey = key;
      await job();
    }
    await sleep(15_000);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
