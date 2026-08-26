// Сквозной прогон формы на моках: сессия → 10 файлов → заявка → письмо.
// Запуск: npm run smoke
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, rm } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3399;
const BASE = `http://127.0.0.1:${PORT}`;
const LOG_DIR = join(ROOT, 'test', '.tmp');

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name} ${extra}`); }
};

const post = (path, body) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

await rm(LOG_DIR, { recursive: true, force: true });

const child = spawn(process.execPath, ['--import', './test/mock-yandex.mjs', 'server.mjs'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    YANDEX_DISK_TOKEN: 'mock-token',
    SMTP_JSON: '1',
    LOG_DIR,
    DISK_ROOT: 'disk:/МИС-заявки',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => process.stdout.write('  [srv] ' + d));
child.stderr.on('data', (d) => process.stderr.write('  [srv!] ' + d));

for (let i = 0; i < 50; i++) {
  try { await fetch(BASE + '/api/limits'); break; } catch { await sleep(100); }
}

try {
  console.log('\n1. Статика и лимиты');
  const page = await fetch(BASE + '/');
  const html = await page.text();
  check('страница отдаётся', page.status === 200 && html.includes('Заявка в техподдержку МИС'));
  const limits = await fetch(BASE + '/api/limits').then((r) => r.json());
  check('лимиты 10 × 100 МБ', limits.maxFiles === 10 && limits.maxFileMb === 100, JSON.stringify(limits));

  console.log('\n2. Загрузка файлов');
  let sessionId = null;
  const uploaded = [];
  for (let i = 1; i <= 10; i++) {
    const size = 1024 * i;
    const r = await post('/api/upload-url', { sessionId, name: `скрин ${i}.png`, size });
    if (r.status !== 200) { check(`ссылка на файл ${i}`, false, JSON.stringify(r.json)); break; }
    sessionId = r.json.sessionId;
    const put = await fetch(r.json.href, { method: 'PUT', body: Buffer.alloc(size, 7) });
    const done = await post('/api/upload-done', { sessionId, fileId: r.json.fileId });
    uploaded.push({ put: put.status, done: done.status, size: done.json.size });
  }
  check('10 файлов загружены и подтверждены',
    uploaded.length === 10 && uploaded.every((u) => u.put === 201 && u.done === 200),
    JSON.stringify(uploaded.slice(0, 2)));
  check('размер сверен с Диском', uploaded[0]?.size === 1024);

  console.log('\n3. Лимиты');
  const eleventh = await post('/api/upload-url', { sessionId, name: '11.png', size: 100 });
  check('11-й файл отклонён', eleventh.status === 400, JSON.stringify(eleventh.json));

  const tooBig = await post('/api/upload-url', { sessionId: null, name: 'big.mp4', size: 101 * 1024 * 1024 });
  check('файл >100 МБ отклонён (413)', tooBig.status === 413, JSON.stringify(tooBig.json));

  console.log('\n4. Удаление файла и замена');
  const list = await post('/api/upload-url', { sessionId, name: 'x', size: 1 }); // должен упасть — лимит
  check('лимит держится до удаления', list.status === 400);

  console.log('\n4b. Одинаковые имена файлов');
  {
    const r = await post('/api/session', {});
    const s3 = r.json.sessionId;
    const both = await Promise.all([
      post('/api/upload-url', { sessionId: s3, name: 'screenshot.png', size: 100 }),
      post('/api/upload-url', { sessionId: s3, name: 'screenshot.png', size: 200 }),
    ]);
    const hrefs = both.map((b) => b.json.href);
    check('параллельные файлы с одним именем получают разные адреса',
      hrefs[0] && hrefs[1] && hrefs[0] !== hrefs[1], JSON.stringify(hrefs));

    for (const [i, b] of both.entries()) {
      await fetch(b.json.href, { method: 'PUT', body: Buffer.alloc(100 * (i + 1), 1) });
      await post('/api/upload-done', { sessionId: s3, fileId: b.json.fileId });
    }
    const t = await post('/api/ticket', {
      sessionId: s3, clinic: 'Медгород', module: 'ЭМК', user: 'u', title: 't',
      steps: 's', fact: 'f', expect: 'e', urgency: 'Незначительно / пожелание', contact: 'c',
    });
    const names = (t.json.text.match(/· (\S+screenshot\.png)/g) || []);
    check('оба файла уцелели под разными именами',
      /Вложения \(2\)/.test(t.json.text) && names.length === 2 && names[0] !== names[1],
      names.join(' , '));
  }

  console.log('\n5. Резервный канал (upload-proxy)');
  {
    const r = await post('/api/session', {});
    const s2 = r.json.sessionId;
    const u = await post('/api/upload-url', { sessionId: s2, name: 'через прокси.png', size: 2048 });
    const put = await fetch(`${BASE}/api/upload-proxy?sessionId=${s2}&fileId=${u.json.fileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.alloc(2048, 3),
    });
    const done = await post('/api/upload-done', { sessionId: s2, fileId: u.json.fileId });
    check('файл прошёл через прокси', put.status === 200 && done.status === 200 && done.json.size === 2048,
      `${put.status}/${done.status}`);
    const bad = await fetch(`${BASE}/api/upload-proxy?sessionId=${s2}&fileId=нет-такого`, {
      method: 'PUT', body: 'x',
    });
    check('прокси не принимает чужой fileId', bad.status === 404, String(bad.status));
  }

  console.log('\n5b. Валидация заявки');
  const bad = await post('/api/ticket', { sessionId, clinic: 'Медгород' });
  check('пустые поля не проходят', bad.status === 400 && bad.json.missing?.length > 0, JSON.stringify(bad.json));

  console.log('\n6. Отправка заявки');
  const ok = await post('/api/ticket', {
    sessionId,
    clinic: 'Медгород', module: 'ЭМК', user: 'Халидуллина А. Б. / логин 742',
    patient: 'СУРОА61', title: 'Пропал редактор онкодиагнозов',
    steps: '1. Войти в ЭМК\n2. Открыть карту', fact: 'Обычный редактор',
    expect: 'Редактор онкодиагноза', urgency: 'Блокирует работу (полный отказ)',
    contact: '+7 900 000-00-00 / a.b@clinic.ru',
  });
  check('заявка принята', ok.status === 200, JSON.stringify(ok.json).slice(0, 300));
  check('номер выдан', /^ТП-\d{4}-\d{4}$/.test(ok.json.ticketNo || ''), ok.json.ticketNo);
  check('приоритет P0/P1', /P0/.test(ok.json.priority || ''), ok.json.priority);
  check('письмо ушло', ok.json.mailed === true, ok.json.warning || '');
  check('публичная ссылка на папку есть', Boolean(ok.json.publicUrl), String(ok.json.publicUrl));
  check('текст содержит вложения', /Вложения \(10\)/.test(ok.json.text || ''));

  console.log('\n7. Повторная отправка');
  const again = await post('/api/ticket', {
    sessionId, clinic: 'Медгород', module: 'ЭМК', user: 'x', title: 'y',
    steps: 'z', fact: 'a', expect: 'b', urgency: 'Мешает, есть обходной путь', contact: 'c',
  });
  check('дубль отклонён (409)', again.status === 409, String(again.status));

  console.log('\n8. Журнал заявок');
  const log = await readFile(join(LOG_DIR, 'tickets.jsonl'), 'utf8');
  const rec = JSON.parse(log.trim().split('\n').pop());
  check('запись в tickets.jsonl', rec.ticketNo === ok.json.ticketNo && rec.files.length === 10);
  check('в журнале зафиксирована отправка письма', rec.mailed === true);
} finally {
  child.kill();
  await sleep(150);
  await rm(LOG_DIR, { recursive: true, force: true });
}

console.log(failures ? `\nПРОВАЛЕНО: ${failures}` : '\nВсе проверки прошли');
process.exit(failures ? 1 : 0);
