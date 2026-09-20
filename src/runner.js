import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = path.join(__dirname, 'tasks');

/**
 * src/tasks/*.js dosyalarını keşfeder.
 * Her görev `export async function run(ctx)` veya default export export etmeli.
 * Geriye dönük uyumluluk: dosya doğrudan main() çalıştırıyorsa `run` yoktur —
 * o durumda dosya child process olarak değil, import + run çağrısı ile çalışır.
 */
export async function listTasks() {
  const entries = await fs.readdir(TASKS_DIR);
  return entries
    .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
    .map((f) => f.replace(/\.js$/, ''))
    .sort();
}

export async function loadTask(name) {
  const file = path.join(TASKS_DIR, `${name}.js`);
  try {
    await fs.access(file);
  } catch {
    const available = await listTasks();
    throw new Error(
      `Bilinmeyen görev: "${name}". Mevcut görevler: ${available.join(', ') || '(yok)'}`
    );
  }

  const mod = await import(pathToFileURL(file).href);
  if (typeof mod.run === 'function') return mod.run;
  if (typeof mod.default === 'function') return mod.default;

  throw new Error(
    `Görev "${name}" bir run() export etmiyor. ` +
      `src/tasks/${name}.js içinde \`export async function run({ browser, context, page })\` tanımlayın.`
  );
}
