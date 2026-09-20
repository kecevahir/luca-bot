#!/usr/bin/env node
/**
 * luca-bot giriş noktası — görevleri listeler / çalıştırır / zamanlar.
 *
 * Kullanım:
 *   npm start                  # görev listesi
 *   npm start -- login-test    # tek görev
 *   npm start -- login-test --once
 *
 * Zamanlama .env içindeki LUCA_SCHEDULE ile veya --schedule ile verilir.
 */

import { config, getCredentials } from './config.js';
import { launchBrowser, ensureLoggedIn, captureErrorScreenshot } from './browser.js';
import { listTasks, loadTask } from './runner.js';
import { runScheduled } from './scheduler.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set();
  const positional = [];
  let schedule = config.schedule || '';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--once') flags.add('once');
    else if (a === '--list' || a === '-l') flags.add('list');
    else if (a === '--help' || a === '-h') flags.add('help');
    else if (a === '--schedule') {
      schedule = args[++i] ?? '';
    } else if (a.startsWith('--schedule=')) {
      schedule = a.slice('--schedule='.length);
    } else if (a.startsWith('-')) {
      throw new Error(`Bilinmeyen seçenek: ${a}`);
    } else {
      positional.push(a);
    }
  }

  return { taskName: positional[0], flags, schedule };
}

function printHelp(tasks) {
  console.log(`luca-bot — Luca Mali Müşavir otomasyon botu

Kullanım:
  npm start -- <görev> [--once] [--schedule "every:3600"|cron]
  npm start -- --list

Görevler:
${tasks.map((t) => `  - ${t}`).join('\n') || '  (henüz yok)'}

Örnekler:
  npm start -- login-test
  npm start -- login-test --schedule "every:3600"
  npm start -- login-test --schedule "0 9 * * 1-5"
`);
}

async function executeTask(taskFn) {
  const { browser, context, page } = await launchBrowser();
  try {
    await ensureLoggedIn(page, context);
    await taskFn({ browser, context, page });
  } catch (err) {
    const shot = await captureErrorScreenshot(page, 'task-error');
    console.error('Görev başarısız:', err.message);
    if (shot) console.error('Ekran görüntüsü:', shot);
    throw err;
  } finally {
    await browser.close();
  }
}

async function main() {
  const tasks = await listTasks();
  let parsed;
  try {
    parsed = parseArgs(process.argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const { taskName, flags, schedule } = parsed;

  if (flags.has('help') || flags.has('list') || !taskName) {
    printHelp(tasks);
    return;
  }

  const taskFn = await loadTask(taskName);
  // Tarayıcı açmadan önce kimlik bilgilerini doğrula
  getCredentials();
  const effectiveSchedule = flags.has('once') ? '' : schedule;

  try {
    await runScheduled(effectiveSchedule, async () => {
      const started = new Date().toISOString();
      console.log(`[${started}] görev başlıyor: ${taskName}`);
      try {
        await executeTask(taskFn);
        console.log(`[${new Date().toISOString()}] görev bitti: ${taskName}`);
      } catch (err) {
        process.exitCode = 1;
        if (!effectiveSchedule) throw err;
        console.error(
          'Zamanlayıcı devam ediyor; bir sonraki turda tekrar denenecek.'
        );
      }
    });
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
