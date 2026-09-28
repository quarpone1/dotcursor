// Сторож: проверяет форму и бота заявок и пишет в канал MAX, когда что-то
// сломалось и когда починилось. Один прогон = одна проверка; раз в минуту его
// запускает systemd-таймер mis-watchdog.timer. Руками: npm run watchdog
//
// Что проверяем:
//   form     — форма жива (GET /api/limits, дёшево, каждый прогон)
//   health   — форма видит Яндекс.Диск и SMTP (GET /api/health, раз в WATCH_DEEP_MIN минут:
//              там настоящий вход в почту, долбить им каждую минуту незачем)
//   bot      — процесс бота заявок жив (GET /health)
//   max      — API MAX принимает токен бота (GET /me): ловит отозванный токен и поломку TLS
//   webhook  — вебхук MAX всё ещё смотрит на нашего бота, а не на Planfix напрямую
//
// Шум гасим: тревога — после WATCH_FAIL_AFTER неудач подряд, напоминание — раз в
// WATCH_REMIND_MIN минут, пока не починят, и одно «починилось» в конце.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MaxApi } from '../bot/max-api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

const FORM_URL = env.WATCH_FORM_URL || `http://127.0.0.1:${env.PORT || 3210}`;
const BOT_URL = env.WATCH_BOT_URL || `http://127.0.0.1:${env.BOT_PORT || 3211}`;
const FAIL_AFTER = Math.max(1, Number(env.WATCH_FAIL_AFTER || 2));
const REMIND_MS = Number(env.WATCH_REMIND_MIN || 60) * 60_000;
const DEEP_MS = Number(env.WATCH_DEEP_MIN || 15) * 60_000;
const TIMEOUT_MS = Number(env.WATCH_TIMEOUT_S || 10) * 1000;
const SKIP = new Set(String(env.WATCH_SKIP || '').split(',').map((s) => s.trim()).filter(Boolean));
const STATE_DIR = env.BOT_STATE_DIR || env.LOG_DIR || join(ROOT, 'data');
const STATE_FILE = join(STATE_DIR, 'watchdog.json');
const HOST = env.WATCH_HOST_NAME || hostname();

const BOT_TOKEN = env.MAX_BOT_TOKEN;
const ALERT_TOKEN = env.MAX_ALERT_TOKEN || BOT_TOKEN;
const CHAT_ID = env.MAX_ALERT_CHAT_ID;
// Бот заявок считаем установленным, если есть и токен, и секрет вебхука —
// то же условие, по которому его ставит установщик.
const BOT_INSTALLED = Boolean(BOT_TOKEN && env.BOT_WEBHOOK_SECRET);

if (!ALERT_TOKEN || !CHAT_ID) {
  console.error('✗ Некуда слать тревоги: нужны MAX_ALERT_CHAT_ID и MAX_ALERT_TOKEN (или MAX_BOT_TOKEN)');
  process.exit(2);
}

const TITLES = {
  form: 'Форма заявок не отвечает',
  health: 'Форма не видит Яндекс.Диск или почту',
  bot: 'Бот заявок не отвечает',
  max: 'API MAX не принимает бота заявок',
  webhook: 'Вебхук MAX смотрит не на бота заявок',
};
const RECOVERED = {
  form: 'Форма заявок снова отвечает',
  health: 'Форма снова видит Яндекс.Диск и почту',
  bot: 'Бот заявок снова отвечает',
  max: 'API MAX снова принимает бота заявок',
  webhook: 'Вебхук MAX снова смотрит на бота заявок',
};

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const code = e.cause?.code || e.name;
    if (code === 'ECONNREFUSED') throw new Error('процесс не слушает порт — сервис остановлен?');
    if (code === 'TimeoutError') throw new Error(`нет ответа за ${TIMEOUT_MS / 1000} с`);
    throw new Error(e.cause?.message || e.message);
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { status: res.status, json, text };
}

const checks = {
  async form() {
    const r = await getJson(`${FORM_URL}/api/limits`);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  },
  async health() {
    const r = await getJson(`${FORM_URL}/api/health`);
    if (r.json?.ok) return;
    const why = [];
    if (r.json && typeof r.json.disk !== 'object') why.push(`Диск: HTTP ${r.json.disk}`);
    if (r.json?.mail && !r.json.mail.ok) why.push(`почта: ${r.json.mail.error || 'не пускает'}`);
    throw new Error(why.join('; ') || `HTTP ${r.status}`);
  },
  async bot() {
    const r = await getJson(`${BOT_URL}/health`);
    if (r.status !== 200 || !r.json?.ok) throw new Error(`HTTP ${r.status}`);
  },
  async max() {
    await new MaxApi(BOT_TOKEN).me();
  },
  async webhook() {
    const { subscriptions = [] } = await new MaxApi(BOT_TOKEN).subscriptions();
    if (subscriptions.some((s) => String(s.url || '').includes(env.BOT_WEBHOOK_SECRET))) return;
    const urls = subscriptions.map((s) => s.url).join(', ') || 'подписок нет';
    throw new Error(`сейчас: ${urls}. Вернуть: npm run max:webhook -- --set https://<домен>/max-hook/<секрет>`);
  },
};

function enabled(name) {
  if (SKIP.has(name)) return false;
  if (['bot', 'max', 'webhook'].includes(name)) return BOT_INSTALLED;
  return true;
}

async function loadState() {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')); }
  catch { return { checks: {}, deepAt: 0 }; }
}

async function saveState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, STATE_FILE);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const minutes = (ms) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 120 ? `${m} мин` : `${Math.round(m / 60)} ч`;
};
const clock = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/* ---------- прогон ---------- */

const now = Date.now();
const state = await loadState();
state.checks ||= {};

const deepDue = now - (state.deepAt || 0) >= DEEP_MS;
const names = Object.keys(checks).filter(enabled).filter((n) => n !== 'health' || deepDue);
const results = await Promise.all(names.map(async (name) => {
  try { await checks[name](); return { name, ok: true }; }
  catch (e) { return { name, ok: false, error: e.message }; }
}));
if (names.includes('health')) state.deepAt = now;

const alerts = [];     // что сообщить в этом прогоне
const onSent = [];     // что отметить в состоянии, если сообщение ушло

for (const { name, ok, error } of results) {
  const st = (state.checks[name] ||= { fails: 0 });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ': ' + error}`);

  if (ok) {
    if (st.alerted) {
      alerts.push(`🟢 <b>${RECOVERED[name]}</b> — не работало ${minutes(now - st.since)}`);
      onSent.push(() => { state.checks[name] = { fails: 0 }; });
    } else {
      state.checks[name] = { fails: 0 };
    }
    continue;
  }

  st.fails += 1;
  st.since ||= now;
  st.error = error;
  if (st.fails < FAIL_AFTER) continue;
  if (st.alerted && now - st.lastAlertAt < REMIND_MS) continue;

  const head = st.alerted ? `🔴 <b>${TITLES[name]}</b> — всё ещё, с ${clock(st.since)}` : `🔴 <b>${TITLES[name]}</b>`;
  alerts.push(`${head}\n${esc(error)}`);
  onSent.push(() => { st.alerted = true; st.lastAlertAt = now; });
}

let exitCode = results.every((r) => r.ok) ? 0 : 1;

if (alerts.length) {
  const text = `${alerts.join('\n\n')}\n\n<i>${esc(HOST)} · ${clock(now)}</i>`;
  try {
    await new MaxApi(ALERT_TOKEN).send({ chatId: CHAT_ID, text: text.slice(0, 4000), format: 'html' });
    for (const f of onSent) f();
    console.log(`→ в канал ушло сообщений: ${alerts.length}`);
  } catch (e) {
    // Состояние не трогаем: на следующем прогоне попробуем отправить снова.
    console.error(`‼ Тревога не ушла в MAX: ${e.message}`);
    exitCode = 1;
  }
}

await saveState(state);
process.exit(exitCode);
