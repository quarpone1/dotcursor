// Инженеры, которым бот шлёт уведомления в MAX: новая заявка по их клинике,
// ответ клиента, кнопка «В работу».
//
// Инженер сам привязывает свой MAX к логину YouTrack, написав боту
//   инженер <логин> <код>
// Код один на всех (BOT_ENGINEER_CODE в окружении) — без него любой пользователь
// бота мог бы подписаться на чужие заявки с данными пациентов. Логин должен быть
// из таблицы инженеров (ENGINEER_LOGINS) или из BOT_ENGINEER_LOGINS; «все» —
// подписка на заявки всех клиник (для старшего); «<логин> все» — всё и при
// этом кнопка «В работу» ставит исполнителем этот логин.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ENGINEER_LOGINS } from '../ticket.mjs';

export const ALL = '*';
const CODE = process.env.BOT_ENGINEER_CODE || '';
const EXTRA = (process.env.BOT_ENGINEER_LOGINS || '').split(/[,\s]+/).filter(Boolean);
export const engineersEnabled = Boolean(CODE);

const known = () => new Set([...Object.values(ENGINEER_LOGINS), ...EXTRA]);

const CMD_RE = /^\/?(?:инженер|engineer)(?:\s+(.*))?$/i;

const isAll = (w) => /^(все|all|\*)$/i.test(w || '');

/**
 * Разбирает команду инженера. null — это не команда.
 * {login, all, code} — регистрация; {stop:true} — отписаться; {help:true} — без аргументов.
 */
export function parseCommand(text) {
  const m = CMD_RE.exec(String(text || '').trim());
  if (!m) return null;
  const args = (m[1] || '').trim().split(/\s+/).filter(Boolean);
  if (!args.length) return { help: true };
  if (/^(стоп|stop|off|выкл)$/i.test(args[0])) return { stop: true };
  if (isAll(args[0])) return { login: ALL, all: true, code: args[1] || '' };
  if (isAll(args[1])) return { login: args[0], all: true, code: args[2] || '' };
  return { login: args[0], all: false, code: args[1] || '' };
}

export class Engineers {
  constructor(file) {
    this.file = file;
    this.list = [];   // {login, userId, chatId, name, since}
  }

  async load() {
    try { this.list = JSON.parse(await readFile(this.file, 'utf8')); } catch { this.list = []; }
    if (this.list.length) console.log(`Инженеров на уведомлениях: ${this.list.map((e) => e.login).join(', ')}`);
  }

  async save() {
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(this.list, null, 1), 'utf8');
    } catch (err) { console.error('Не сохранил список инженеров:', err.message); }
  }

  /** Результат регистрации — текст для ответа человеку. */
  async register({ login, all = false, code }, { userId, chatId = null, name = null }) {
    if (!engineersEnabled) return { ok: false, text: 'Уведомления для инженеров на этом боте не включены.' };
    if (!code || code !== CODE) return { ok: false, text: 'Неверный код. Формат: инженер <логин YouTrack> <код>' };
    if (login !== ALL && !known().has(login)) {
      return { ok: false, text: `Логин «${login}» не из списка инженеров. Известные: ${[...known()].join(', ')}, или «все».` };
    }
    this.list = this.list.filter((e) => e.userId !== userId);
    all = all || login === ALL;
    this.list.push({ login, all, userId, chatId, name, since: new Date().toISOString() });
    await this.save();
    console.log(`Инженер ${login}${all ? ' (все клиники)' : ''} (${name || userId}) подписан на уведомления`);
    const what = all ? 'заявки всех клиник' : `заявки клиник инженера ${login}`;
    return { ok: true, text: `Готово. Сюда будут приходить ${what}: новые заявки, ответы клиентов, кнопка «В работу».\nОтписаться: инженер стоп` };
  }

  async unregister(userId) {
    const was = this.list.find((e) => e.userId === userId);
    if (!was) return { ok: false, text: 'Вы и не были подписаны.' };
    this.list = this.list.filter((e) => e.userId !== userId);
    await this.save();
    console.log(`Инженер ${was.login} отписан от уведомлений`);
    return { ok: true, text: 'Уведомления выключены. Включить снова: инженер <логин> <код>' };
  }

  byUserId(userId) { return this.list.find((e) => e.userId === userId) || null; }

  /** Кому слать по заявке с таким исполнителем: сам инженер и подписанные на «все». */
  targetsFor(login) {
    return this.list.filter((e) => e.all || e.login === ALL || (login && e.login === login));
  }
}
