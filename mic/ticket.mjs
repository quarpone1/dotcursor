// Общее для веб-формы и бота в MAX: номер заявки, приоритет и текст карточки.
// Держим в одном месте, чтобы инженер видел одинаковую карточку независимо
// от того, откуда пришла заявка.
import { randomInt } from 'node:crypto';

export const CLINICS = [
  'МедГород',
  'Нефтяник стационар',
  'Нефтяник Шиллера',
  'Нефтяник Здоровье',
  'Нефтяник Нов.Уренгой',
  'Нефтяник-Мед',
  'Нефтяник Курган',
  'Нигинского',
  'ТГМУ',
  'ДОКТОР МИРА',
  'ГП-17',
  'ГП-1',
  'Юнимед',
  'Юнидент',
  'Медикус (Медавто)',
];

// Закреплённый инженер на каждый объект. Идентификаторы сверены с задачами
// Planfix: Деравчук user:1, Касимов user:7, Перевертов user:43, Щербаков user:63.
export const CLINIC_ENGINEER = {
  'МедГород': 'user:1',
  'Нефтяник стационар': 'user:7',
  'Нефтяник Шиллера': 'user:7',
  'Нефтяник Здоровье': 'user:43',
  'Нефтяник Нов.Уренгой': 'user:43',
  'Нефтяник-Мед': 'user:1',
  'Нефтяник Курган': 'user:43',
  'Нигинского': 'user:7',
  'ТГМУ': 'user:7',
  'ДОКТОР МИРА': 'user:43',
  'ГП-17': 'user:63',
  'ГП-1': 'user:63',
  'Юнимед': 'user:1',
  'Юнидент': 'user:7',
  'Медикус (Медавто)': 'user:43',
};

export const MODULES = [
  'ЭМК',
  'Локус (регистратура/расписание)',
  'Касса',
  'ЛИС (лаборатория)',
  'Аптека',
  'Отчётность / реестры',
  'Другое',
];

// Что оформляем: ошибка в работе МИС или пожелание доработать.
export const KINDS = ['Ошибка', 'Доработка'];

// Роль пользователя в МИС. Список не закрытый — бот принимает и свой вариант текстом.
export const ROLES = [
  'Врач',
  'Медсестра',
  'Регистратор',
  'Кассир',
  'Администратор',
  'Лаборант',
  'Статистик',
  'Руководитель',
];

export const URGENCIES = [
  'Блокирует работу (полный отказ)',
  'Мешает, есть обходной путь',
  'Незначительно / пожелание',
];

export function ticketNumber(now = new Date()) {
  return `ТП-${now.getFullYear()}-${randomInt(1000, 10000)}`;
}

export function priorityOf(urgency) {
  if (/Блокирует/.test(urgency)) return ['P0/P1 — критично', '1 час / 4 часа'];
  if (/Мешает/.test(urgency)) return ['P2 — средний', '4 дня'];
  return ['P3/P4 — низкий', 'по плану релизов'];
}

/**
 * Текст карточки заявки.
 * @param {object} p
 * @param {string} p.ticketNo
 * @param {object} p.fields    поля заявки
 * @param {Array}  [p.files]   [{name, size}] — вложения
 * @param {string} [p.folder]  папка на Яндекс.Диске (веб-форма)
 * @param {string} [p.source]  откуда заявка: 'форма' | 'бот MAX'
 */
export function ticketText({ ticketNo, fields: f, files = [], folder = null, source = null, now = new Date() }) {
  const pr = priorityOf(f.urgency);
  const kind = f.kind || KINDS[0];
  const isWish = kind === KINDS[1];

  const lines = [
    `Заявка ${ticketNo} · ${kind.toLowerCase()}`,
    `Создана: ${now.toLocaleString('ru-RU')}${source ? ` · ${source}` : ''}`,
    `Приоритет (предварительный): ${pr[0]} · SLA ${pr[1]}`,
    '',
    `Клиника: ${f.clinic}`,
    `Модуль: ${f.module}`,
    ...(f.role ? [`Роль: ${f.role}`] : []),
    `Пользователь: ${f.user}`,
    ...(f.patient ? [`Пациент (карта / КБП): ${f.patient}`] : []),
    '',
  ];

  if (isWish) {
    lines.push(
      `Доработка: ${f.title}`,
      '',
      'Что нужно сделать:',
      f.wish,
      '',
      'Зачем / ожидаемый эффект:',
      f.reason,
    );
  } else {
    lines.push(
      `Ошибка: ${f.title}`,
      '',
      'Шаги воспроизведения:',
      f.steps,
      '',
      `Фактический результат: ${f.fact}`,
      `Ожидаемый результат: ${f.expect}`,
    );
  }

  lines.push(
    '',
    `Срочность (заявитель): ${f.urgency}`,
    `Контакт: ${f.contact}`,
    '',
    files.length ? `Вложения (${files.length}):` : 'Вложения: нет',
    ...files.map((x) => `  · ${x.name}${x.size ? ` — ${(x.size / 1048576).toFixed(1)} МБ` : ''}`),
  );
  if (folder) lines.push('', `Папка на Яндекс.Диске: ${folder}`);
  return lines.join('\n');
}
