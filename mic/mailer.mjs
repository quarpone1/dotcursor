// Отправка заявки на почту Planfix.
// Planfix создаёт задачу из входящего письма: тема → название задачи, тело → описание.
import nodemailer from 'nodemailer';

const HOST = process.env.SMTP_HOST || 'smtp.yandex.ru';
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.MAIL_FROM || USER;
const TO = process.env.MAIL_TO || 'RomanFigol@sensey.planfix.ru';

// Крупные вложения в письмо не лезут — они остаются ссылкой на Диск.
const ATTACH_MAX_FILE = Number(process.env.MAIL_ATTACH_MAX_MB || 10) * 1024 * 1024;
const ATTACH_MAX_TOTAL = Number(process.env.MAIL_ATTACH_TOTAL_MB || 20) * 1024 * 1024;

// SMTP_JSON=1 — режим прогона без реальной отправки (письмо возвращается как JSON).
const JSON_MODE = process.env.SMTP_JSON === '1';

export const mailConfigured = JSON_MODE || Boolean(USER && PASS);

const transporter = JSON_MODE
  ? nodemailer.createTransport({ jsonTransport: true })
  : mailConfigured
  ? nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      requireTLS: PORT !== 465,     // на 587 обязателен STARTTLS
      auth: { user: USER, pass: PASS },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 120000,
    })
  : null;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function subject(ticketNo, priority, fields) {
  const short = fields.title.replace(/\s+/g, ' ').slice(0, 90);
  return `[${ticketNo}] ${priority} · ${fields.clinic} / ${fields.module} — ${short}`;
}

/**
 * @param {object} p
 * @param {string} p.ticketNo
 * @param {string} p.priority
 * @param {string} p.sla
 * @param {object} p.fields   поля формы
 * @param {string} p.text     готовый текст заявки
 * @param {string} p.folder   путь на Диске
 * @param {string|null} p.publicUrl  публичная ссылка на папку (может быть null)
 * @param {Array}  p.attachments  [{filename, content}]
 */
export async function sendTicketMail(p) {
  if (!transporter) throw new Error('SMTP не настроен (SMTP_USER / SMTP_PASS)');

  const linkBlock = p.publicUrl
    ? `Файлы заявки: ${p.publicUrl}`
    : `Файлы заявки: ${p.folder} (на Яндекс.Диске техподдержки)`;

  const body = [
    p.text,
    '',
    '—',
    linkBlock,
    `SLA: ${p.sla}`,
  ].join('\n');

  const contactMail = (p.fields.contact.match(EMAIL_RE) || [])[0];

  return transporter.sendMail({
    from: FROM,
    to: TO,
    subject: subject(p.ticketNo, p.priority, p.fields),
    text: body,
    replyTo: contactMail || undefined,
    attachments: p.attachments || [],
  });
}

/** Отбирает файлы, которые имеет смысл приложить письмом, и качает их с Диска. */
export async function collectAttachments(files, downloadHref) {
  const out = [];
  let total = 0;
  for (const f of files) {
    if (f.size > ATTACH_MAX_FILE || total + f.size > ATTACH_MAX_TOTAL) continue;
    try {
      const href = await downloadHref(f.path);
      if (!href) continue;
      const res = await fetch(href);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      out.push({ filename: f.diskName, content: buf });
      total += buf.length;
    } catch {
      // одно неудачное вложение не должно ронять письмо — файл остаётся на Диске
    }
  }
  return out;
}

export async function verifyMail() {
  if (!transporter) return { ok: false, error: 'SMTP не настроен' };
  if (JSON_MODE) return { ok: true, to: TO, from: FROM, host: 'json-transport' };
  try {
    await transporter.verify();
    return { ok: true, to: TO, from: FROM, host: HOST };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
