// Проверка настройки Яндекс.Диска: токен, место, права на запись и публикацию.
// Запуск: npm run disk:check   (токен берётся из .env или окружения)
const TOKEN = process.env.YANDEX_DISK_TOKEN;
const DISK_ROOT = (process.env.DISK_ROOT || 'disk:/МИС-заявки').replace(/\/+$/, '');
const API = 'https://cloud-api.yandex.net/v1/disk';

if (!TOKEN) {
  console.error('✗ YANDEX_DISK_TOKEN не задан.');
  console.error('  Положите токен в .env (локально) или /etc/mis-form.env (на сервере).');
  process.exit(1);
}

const gb = (n) => (n / 1024 ** 3).toFixed(1) + ' ГБ';

async function yd(method, endpoint, params = {}) {
  const url = new URL(API + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `OAuth ${TOKEN}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  return { status: res.status, ok: res.ok, json, text };
}

let failed = false;
const step = (ok, msg, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${msg}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed = true;
};

/* 1. Токен и место */
const info = await yd('GET', '/');
if (!info.ok) {
  step(false, 'Токен не принят', `HTTP ${info.status} ${info.text.slice(0, 160)}`);
  console.error('\n  401 — токен неверный или отозван. 403 — у приложения нет прав на Диск.');
  process.exit(1);
}
const free = info.json.total_space - info.json.used_space;
step(true, `Токен работает, аккаунт: ${info.json.user?.login || 'неизвестен'}`);
step(true, `Место: занято ${gb(info.json.used_space)} из ${gb(info.json.total_space)}, свободно ${gb(free)}`);

const perTicket = Number(process.env.MAX_FILES || 10) * Number(process.env.MAX_FILE_MB || 100) / 1024;
const tickets = Math.floor(free / 1024 ** 3 / perTicket);
if (tickets < 20) {
  step(false, `Свободного места хватит примерно на ${tickets} «тяжёлых» заявок по ${perTicket.toFixed(1)} ГБ`,
    'стоит расширить тариф или чистить старые папки');
} else {
  step(true, `Запас: примерно ${tickets} заявок максимального размера`);
}

/* 2. Запись */
const probeDir = `${DISK_ROOT}/_проверка`;
for (const seg of DISK_ROOT.replace(/^disk:\//, '').split('/').filter(Boolean).reduce((acc, s) => {
  acc.push((acc[acc.length - 1] || 'disk:') + '/' + s); return acc;
}, [])) {
  const r = await yd('PUT', '/resources', { path: seg });
  if (!r.ok && r.status !== 409) {
    step(false, `Не удалось создать папку ${seg}`, `HTTP ${r.status}`);
    process.exit(1);
  }
}
step(true, `Корневая папка на месте: ${DISK_ROOT}`);

const mk = await yd('PUT', '/resources', { path: probeDir });
step(mk.ok || mk.status === 409, 'Права на создание папок есть');

const up = await yd('GET', '/resources/upload', { path: `${probeDir}/тест.txt`, overwrite: 'true' });
if (!up.ok) {
  step(false, 'Не выдаётся ссылка на загрузку', `HTTP ${up.status} ${up.text.slice(0, 160)}`);
} else {
  const put = await fetch(up.json.href, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: 'проверка загрузки',
  });
  step(put.ok, 'Файл заливается по одноразовой ссылке', put.ok ? '' : `HTTP ${put.status}`);
}

/* 3. Публикация папки (нужна, чтобы вложения открывались из Planfix) */
if (process.env.PUBLISH_FOLDER === 'false') {
  console.log('· Публикация отключена (PUBLISH_FOLDER=false) — пропускаю');
} else {
  const pub = await yd('PUT', '/resources/publish', { path: probeDir });
  const meta = await yd('GET', '/resources', { path: probeDir, fields: 'public_url' });
  step(pub.ok && Boolean(meta.json?.public_url), 'Папка публикуется по ссылке',
    meta.json?.public_url || `HTTP ${pub.status}`);
}

/* 4. Уборка */
const del = await yd('DELETE', '/resources', { path: probeDir, permanently: 'true' });
step(del.ok || del.status === 202 || del.status === 204, 'Тестовая папка удалена');

console.log(failed
  ? '\nЕсть проблемы — смотрите строки со знаком ✗'
  : '\nДиск настроен верно.');
process.exit(failed ? 1 : 0);
