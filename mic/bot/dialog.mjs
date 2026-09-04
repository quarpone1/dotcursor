// Сценарий диалога заявки — чистая логика, без сети и без MAX.
// Всё состояние снаружи, ответы — обычные объекты. Так сценарий гоняется
// тестами и в терминале, а бот остаётся тонкой оболочкой поверх.
import {
  CLINICS, MODULES, URGENCIES, KINDS, ROLES, ticketNumber, ticketText, priorityOf,
} from '../ticket.mjs';

export const MAX_FILES = Number(process.env.MAX_FILES || 10);

const NAV_BACK = 'nav:back';
const NAV_CANCEL = 'nav:cancel';

const isBug = (a) => (a.kind || KINDS[0]) === KINDS[0];
const isWish = (a) => !isBug(a);

/**
 * Шаги заявки. У ошибки и доработки часть шагов общая, часть своя —
 * `when` решает, задавать ли вопрос при текущих ответах.
 * `ask` может зависеть от типа: тогда это объект {bug, wish}.
 */
export const STEPS = [
  {
    id: 'kind', type: 'choice', options: KINDS,
    ask: 'Что оформляем?',
    labels: ['🐞 Ошибка', '✨ Доработка'],
  },
  {
    id: 'clinic', type: 'choice', options: CLINICS,
    ask: 'Из какой вы клиники?',
  },
  {
    id: 'module', type: 'choice', options: MODULES,
    ask: { bug: 'В каком модуле МИС проблема?', wish: 'Какого модуля МИС касается доработка?' },
  },
  {
    id: 'role', type: 'choice', options: ROLES, freeText: true,
    ask: 'Какая у вас роль в МИС?',
    hint: 'Выберите кнопкой или напишите свою.',
  },
  {
    id: 'user', type: 'text',
    ask: { bug: 'Кто столкнулся с проблемой?', wish: 'От кого доработка?' },
    hint: 'ФИО и логин или код. Например: Иванов А. А. / логин 123',
    validate: (v) => (v.length < 3 ? 'Слишком коротко — нужны ФИО и логин.' : null),
  },
  {
    id: 'patient', type: 'text', optional: true, when: isBug,
    ask: 'Если проблема на конкретном пациенте — номер карты и КБП.',
    hint: 'Без ФИО. Например: карта А-123456, КБП 78. Если не про пациента — «Пропустить».',
  },
  {
    id: 'title', type: 'text',
    ask: { bug: 'Опишите суть ошибки одной фразой.', wish: 'Опишите суть доработки одной фразой.' },
    hint: { bug: 'Например: не печатается чек на кассе', wish: 'Например: добавить печать направления из ЭМК' },
    validate: (v) => (v.length < 5 ? 'Совсем коротко. Напишите чуть подробнее.' : null),
  },
  // --- только для ошибки ---
  {
    id: 'steps', type: 'text', when: isBug,
    ask: 'Что вы делали по шагам, пока не столкнулись с ошибкой?',
    hint: 'По пунктам: куда зашли, что нажали. Чем точнее — тем быстрее найдём.',
    validate: (v) => (v.length < 10 ? 'Опишите шаги подробнее — по ним инженер повторит ошибку.' : null),
  },
  {
    id: 'fact', type: 'text', when: isBug,
    ask: 'Что получилось в итоге?',
    hint: 'Что вы увидели на экране: сообщение, пустое окно, зависание.',
  },
  {
    id: 'expect', type: 'text', when: isBug,
    ask: 'А что должно было произойти?',
  },
  // --- только для доработки ---
  {
    id: 'wish', type: 'text', when: isWish,
    ask: 'Что именно нужно сделать или изменить?',
    hint: 'Как это должно работать: где, какие поля, какие действия.',
    validate: (v) => (v.length < 10 ? 'Опишите подробнее — по этому инженер будет оценивать работу.' : null),
  },
  {
    id: 'reason', type: 'text', when: isWish,
    ask: 'Зачем это нужно? Какой эффект ожидаете?',
    hint: 'Что сейчас неудобно или невозможно и что изменится после доработки.',
  },
  // --- общее ---
  {
    id: 'urgency', type: 'choice', options: URGENCIES,
    ask: 'Насколько это срочно?',
    labels: ['Блокирует работу', 'Мешает работать', 'Незначительно'],
  },
  {
    id: 'contact', type: 'text',
    ask: 'Как с вами связаться, если понадобятся детали?',
    hint: 'Телефон, почта или мессенджер.',
  },
  {
    id: 'files', type: 'files', optional: true,
    ask: { bug: 'Приложите скриншоты, видео или выгрузку лога.', wish: 'Приложите примеры, макеты или скриншоты, если есть.' },
    hint: `Можно несколько, до ${MAX_FILES}. Когда закончите — нажмите «Готово».`,
  },
];

const stepById = (id) => STEPS.find((s) => s.id === id);

/** Шаги, которые применимы при текущих ответах. */
export function activeSteps(session) {
  return STEPS.filter((s) => !s.when || s.when(session.answers));
}

const currentStep = (session) =>
  session.editing ? stepById(session.editing) : activeSteps(session)[session.stepIndex];

const byKind = (val, answers) =>
  (val && typeof val === 'object') ? (isBug(answers) ? val.bug : val.wish) : val;

export function createSession(user = {}) {
  return {
    ticketNo: ticketNumber(),
    user,                 // {id, name} — кто пишет
    startedAt: Date.now(),
    stepIndex: 0,
    answers: {},
    files: [],
    phase: 'ask',         // ask → confirm → done | cancelled
    editing: null,        // id шага, если правим одно поле из подтверждения
  };
}

/* ---------- отрисовка вопросов ---------- */

function keyboardFor(step, session) {
  const rows = [];
  if (step.type === 'choice') {
    const labels = step.labels || step.options;
    // по две кнопки в ряд, если названия короткие
    const short = labels.every((l) => l.length <= 18);
    for (let i = 0; i < step.options.length; i += short ? 2 : 1) {
      rows.push(
        step.options.slice(i, i + (short ? 2 : 1))
          .map((_, j) => ({ text: labels[i + j], payload: `c:${step.id}:${i + j}` })),
      );
    }
  }
  if (step.type === 'files') {
    rows.push([{ text: session.files.length ? '✓ Готово' : 'Без файлов', payload: 'files:done' }]);
  } else if (step.optional) {
    rows.push([{ text: 'Пропустить', payload: 'skip' }]);
  }

  const nav = [];
  if (!session.editing && session.stepIndex > 0) nav.push({ text: '← Назад', payload: NAV_BACK });
  nav.push({ text: 'Отменить', payload: NAV_CANCEL });
  rows.push(nav);
  return rows;
}

function askMessage(session) {
  const step = currentStep(session);
  const total = activeSteps(session).length;
  const num = session.editing ? null : `${session.stepIndex + 1} из ${total}`;
  const lines = [];
  if (num) lines.push(`Шаг ${num}`);
  lines.push(byKind(step.ask, session.answers));
  const hint = byKind(step.hint, session.answers);
  if (hint) lines.push('', hint);
  if (step.type === 'files' && session.files.length) {
    lines.push('', `Приложено: ${session.files.length} из ${MAX_FILES}`);
    lines.push(...session.files.map((f) => `  · ${f.name}`));
  }
  return { text: lines.join('\n'), buttons: keyboardFor(step, session) };
}

export function summary(session) {
  return ticketText({
    ticketNo: session.ticketNo,
    fields: session.answers,
    files: session.files,
    source: 'бот MAX',
  });
}

function confirmMessage(session) {
  const rows = [
    [{ text: '📨 Отправить в поддержку', payload: 'ok:send' }],
    [{ text: 'Исправить поле', payload: 'ok:edit' }, { text: 'Отменить', payload: NAV_CANCEL }],
  ];
  return {
    text: 'Проверьте, всё ли верно — отправлю одним сообщением:\n\n' + summary(session),
    buttons: rows,
  };
}

function editMenu(session) {
  const rows = [];
  const editable = activeSteps(session).filter((s) => s.type !== 'files');
  for (let i = 0; i < editable.length; i += 2) {
    rows.push(editable.slice(i, i + 2).map((s) => ({
      text: String(byKind(s.ask, session.answers)).slice(0, 22),
      payload: `edit:${s.id}`,
    })));
  }
  rows.push([{ text: '← Назад к проверке', payload: 'ok:back' }]);
  return { text: 'Что поправить?', buttons: rows };
}

/* ---------- переходы ---------- */

function advance(session) {
  // из режима правки одного поля возвращаемся сразу к подтверждению
  if (session.editing) {
    session.editing = null;
    session.phase = 'confirm';
    return confirmMessage(session);
  }
  session.stepIndex++;
  if (session.stepIndex >= activeSteps(session).length) {
    session.phase = 'confirm';
    return confirmMessage(session);
  }
  return askMessage(session);
}

export function start(session) {
  return [askMessage(session)];
}

/**
 * Единственная точка входа. Возвращает список сообщений, которые надо отправить.
 * @param {object} session
 * @param {object} input {type:'text'|'callback'|'attachment', text?, payload?, file?}
 * @returns {{replies: Array, done: boolean, cancelled: boolean}}
 */
export function handle(session, input) {
  const replies = [];
  const out = () => ({ replies, done: session.phase === 'done', cancelled: session.phase === 'cancelled' });

  if (session.phase === 'done' || session.phase === 'cancelled') {
    replies.push({ text: 'Эта заявка уже закрыта. Чтобы создать новую, напишите «заявка».', buttons: [] });
    return out();
  }

  /* --- кнопки --- */
  if (input.type === 'callback') {
    const p = input.payload || '';

    if (p === NAV_CANCEL) {
      session.phase = 'cancelled';
      replies.push({ text: 'Заявка отменена, ничего никуда не ушло. Напишите «заявка», если понадобится снова.', buttons: [] });
      return out();
    }

    if (p === NAV_BACK) {
      if (session.stepIndex > 0) session.stepIndex--;
      session.phase = 'ask';
      replies.push(askMessage(session));
      return out();
    }

    if (p === 'skip') {
      const step = currentStep(session);
      if (!step.optional) {
        replies.push({ text: 'Это поле обязательное.', buttons: [] });
        replies.push(askMessage(session));
        return out();
      }
      session.answers[step.id] = '';
      replies.push(advance(session));
      return out();
    }

    if (p === 'files:done') {
      session.answers.files = session.files.length;
      replies.push(advance(session));
      return out();
    }

    if (p.startsWith('c:')) {
      const [, stepId, idx] = p.split(':');
      const step = stepById(stepId);
      const value = step?.options?.[Number(idx)];
      if (!step || value === undefined) {
        replies.push({ text: 'Не понял выбор, попробуйте ещё раз.', buttons: [] });
        replies.push(askMessage(session));
        return out();
      }
      session.answers[stepId] = value;
      replies.push(advance(session));
      return out();
    }

    if (p === 'ok:edit') { session.phase = 'editing'; replies.push(editMenu(session)); return out(); }
    if (p === 'ok:back') { session.phase = 'confirm'; replies.push(confirmMessage(session)); return out(); }

    if (p.startsWith('edit:')) {
      const id = p.slice(5);
      if (!stepById(id)) { replies.push(editMenu(session)); return out(); }
      session.editing = id;
      session.phase = 'ask';
      replies.push(askMessage(session));
      return out();
    }

    if (p === 'ok:send') {
      session.phase = 'done';
      session.finishedAt = Date.now();
      const [prio, sla] = priorityOf(session.answers.urgency);
      replies.push({
        text: `Заявка ${session.ticketNo} отправлена.\nПриоритет: ${prio} · SLA ${sla}\n\n` +
              'Инженер увидит её целиком, одним сообщением. Ответы придут сюда же.',
        buttons: [],
      });
      return out();
    }

    replies.push({ text: 'Не понял кнопку.', buttons: [] });
    return out();
  }

  /* --- вложения --- */
  if (input.type === 'attachment') {
    const step = currentStep(session);
    if (step?.type !== 'files') {
      // файл прислали не вовремя — запомним, но шаг не двигаем
      if (session.files.length < MAX_FILES) session.files.push(input.file);
      replies.push({ text: `Файл «${input.file.name}» запомнил, приложу к заявке.`, buttons: [] });
      replies.push(askMessage(session));
      return out();
    }
    if (session.files.length >= MAX_FILES) {
      replies.push({ text: `Уже ${MAX_FILES} файлов — больше не поместится. Нажмите «Готово».`, buttons: [] });
      replies.push(askMessage(session));
      return out();
    }
    session.files.push(input.file);
    replies.push(askMessage(session));
    return out();
  }

  /* --- текст --- */
  const text = String(input.text || '').trim();

  if (/^\/?(отмена|cancel|стоп|stop)$/i.test(text)) {
    session.phase = 'cancelled';
    replies.push({ text: 'Заявка отменена, ничего никуда не ушло.', buttons: [] });
    return out();
  }

  if (session.phase === 'confirm' || session.phase === 'editing') {
    replies.push({ text: 'Нажмите кнопку под сообщением: отправить, исправить или отменить.', buttons: [] });
    replies.push(session.phase === 'confirm' ? confirmMessage(session) : editMenu(session));
    return out();
  }

  const step = currentStep(session);

  if (step.type === 'choice') {
    // человек мог написать название вместо нажатия кнопки — примем
    const hit = step.options.find((o) => o.toLowerCase() === text.toLowerCase());
    if (!hit && !step.freeText) {
      replies.push({ text: 'Выберите вариант кнопкой ниже.', buttons: [] });
      replies.push(askMessage(session));
      return out();
    }
    if (!hit && !text) {
      replies.push({ text: 'Пустой ответ. Выберите кнопкой или напишите текстом.', buttons: [] });
      replies.push(askMessage(session));
      return out();
    }
    session.answers[step.id] = hit || text.slice(0, 200);
    replies.push(advance(session));
    return out();
  }

  if (step.type === 'files') {
    replies.push({ text: 'Прикрепите файл вложением или нажмите «Готово».', buttons: [] });
    replies.push(askMessage(session));
    return out();
  }

  if (!text) {
    replies.push({ text: 'Пустой ответ. Напишите текстом.', buttons: [] });
    replies.push(askMessage(session));
    return out();
  }

  const err = step.validate?.(text);
  if (err) {
    replies.push({ text: err, buttons: [] });
    replies.push(askMessage(session));
    return out();
  }

  session.answers[step.id] = text.slice(0, 4000);
  replies.push(advance(session));
  return out();
}
