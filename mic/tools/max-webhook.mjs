// Переключение вебхука бота MAX — с бэкапом и откатом в одну команду.
// Показать:    npm run max:webhook
// Переключить: npm run max:webhook -- --set https://zayavka.dotcursor.ru/max-hook/СЕКРЕТ
// Откатить:    npm run max:webhook -- --restore
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MaxApi } from '../bot/max-api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Бэкап ищем во всех местах, где он мог оказаться: скрипт запускают и руками,
// и из-под сервиса, а переменные окружения при этом разные.
const BACKUP_DIRS = [
  process.env.BOT_STATE_DIR,
  process.env.LOG_DIR,
  '/var/lib/mis-form',
  join(ROOT, 'data'),
].filter(Boolean);
const BACKUP = join(BACKUP_DIRS[0], 'max-webhook-backup.json');

async function readBackup() {
  for (const dir of BACKUP_DIRS) {
    try { return JSON.parse(await readFile(join(dir, 'max-webhook-backup.json'), 'utf8')); }
    catch { /* пробуем следующее место */ }
  }
  return null;
}

const TOKEN = process.env.MAX_BOT_TOKEN;
if (!TOKEN) { console.error('✗ MAX_BOT_TOKEN не задан'); process.exit(1); }

const api = new MaxApi(TOKEN);
const args = process.argv.slice(2);
const setIdx = args.indexOf('--set');
const setUrl = setIdx >= 0 ? args[setIdx + 1] : null;
const restore = args.includes('--restore');

async function show() {
  const { subscriptions = [] } = await api.subscriptions();
  console.log(`Подписки бота: ${subscriptions.length}`);
  for (const s of subscriptions) {
    console.log(`  · ${s.url}`);
    if (s.update_types?.length) console.log(`    типы: ${s.update_types.join(', ')}`);
  }
  return subscriptions;
}

const current = await show();

/* --- откат --- */
if (restore) {
  const saved = await readBackup();
  if (!saved) {
    // Аварийный инструмент не имеет права упереться в пропавший файл.
    const known = process.env.PLANFIX_WEBHOOK_URL;
    console.error('\n✗ Бэкап не найден. Искал в:');
    for (const d of BACKUP_DIRS) console.error('    ' + join(d, 'max-webhook-backup.json'));
    if (known) {
      console.error('\n  Но адрес Planfix есть в настройках — откатывайте им:');
      console.error(`    npm run max:webhook -- --set ${known}`);
    } else {
      console.error('\n  Возьмите адрес Planfix в его настройках интеграции и выполните:');
      console.error('    npm run max:webhook -- --set https://АДРЕС_PLANFIX');
    }
    process.exit(1);
  }

  console.log(`\n→ Возвращаю ${saved.url}`);
  await api.subscribe(saved.url, saved.update_types);
  for (const s of current) {
    if (s.url !== saved.url) { await api.unsubscribe(s.url); console.log(`  снял ${s.url}`); }
  }
  console.log('\nГотово, Planfix снова получает события напрямую.');
  await show();
  process.exit(0);
}

/* --- переключение --- */
if (setUrl) {
  if (!/^https:\/\//.test(setUrl)) {
    console.error('✗ MAX принимает только HTTPS с сертификатом доверенного центра.');
    process.exit(1);
  }
  const planfix = current.find((s) => /planfix/i.test(s.url)) || current[0];
  if (planfix) {
    await mkdir(dirname(BACKUP), { recursive: true });
    await writeFile(BACKUP, JSON.stringify(planfix, null, 1), 'utf8');
    console.log(`\n✓ Прежний вебхук сохранён в ${BACKUP}`);
    console.log(`  ${planfix.url}`);
    console.log('\n  Откат в любой момент:  npm run max:webhook -- --restore');
  }

  console.log(`\n→ Ставлю ${setUrl}`);
  await api.subscribe(setUrl, planfix?.update_types);

  for (const s of current) {
    if (s.url !== setUrl) { await api.unsubscribe(s.url); console.log(`  снял ${s.url}`); }
  }
  console.log('\nТеперь события идут к нам. Проверьте, что бот отвечает в MAX.');
  await show();
  process.exit(0);
}

console.log('\nПереключить:  npm run max:webhook -- --set https://домен/max-hook/СЕКРЕТ');
console.log('Откатить:     npm run max:webhook -- --restore');
