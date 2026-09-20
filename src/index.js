#!/usr/bin/env node
/**
 * luca-bot giriş noktası — görevleri listeler / çalıştırır / zamanlar.
 *
 * Güvenli test:
 *   npm start -- login-test --watch
 *   npm start -- <görev> --watch --step
 *   npm start -- <görev> --dry-run
 */

import { config, getCredentials, applyRuntimeFlags } from './config.js';
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
    else if (a === '--watch' || a === '-w') flags.add('watch');
    else if (a === '--step') flags.add('step');
    else if (a === '--dry-run') flags.add('dry-run');
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
  npm start -- <görev> [seçenekler]
  npm start -- --list

Güvenli test seçenekleri:
  --watch      Tarayıcıyı görünür aç, hareketleri yavaşlat (izle)
  --step       Her kontrol noktasında Enter bekle
  --dry-run    Kritik tıklamaları UYGULAMA (sadece simüle et)
  --once       Zamanlayıcıyı yok say, tek sefer çalıştır

Diğer:
  --schedule "every:3600"|cron

Görevler:
${tasks.map((t) => `  - ${t}`).join('\n') || '  (henüz yok)'}

Önerilen test sırası:
  1) npm start -- login-test --watch
  2) npm start -- <görev> --watch --step --dry-run
  3) npm start -- <görev> --watch --step
  4) (emin olduktan sonra) npm start -- <görev>
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

  applyRuntimeFlags({
    watch: flags.has('watch'),
    step: flags.has('step'),
    dryRun: flags.has('dry-run'),
  });

  if (flags.has('help') || flags.has('list') || !taskName) {
    printHelp(tasks);
    return;
  }

  const taskFn = await loadTask(taskName);
  getCredentials();

  // İzleme / dry-run / step varken zamanlayıcıyı kapat (kazara döngü olmasın)
  const safetyMode = flags.has('watch') || flags.has('step') || flags.has('dry-run');
  const effectiveSchedule =
    flags.has('once') || safetyMode ? '' : schedule;

  if (safetyMode && schedule) {
    console.log('Not: --watch/--step/--dry-run iken zamanlayıcı yok sayılır.');
  }

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
