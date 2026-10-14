// Доверие к сертификату НУЦ Минцифры для platform-api2.max.ru.
//
// Новый домен API MAX подписан «Russian Trusted Root CA», которого нет в
// встроенном в Node наборе корневых сертификатов. NODE_EXTRA_CA_CERTS здесь
// не выручает: из .env (--env-file) Node его не читает — переменная должна
// быть в окружении ещё до старта процесса. Поэтому сертификат добавляем сами,
// к стандартным корням, а не вместо них: Яндекс, Planfix и YouTrack
// продолжают проверяться как раньше.
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';

export const DEFAULT_CA_FILE = '/etc/ssl/max/russian_trusted_root_ca.pem';

let result = null;

/**
 * Добавляет корневой сертификат Минцифры к доверенным. Повторные вызовы ничего не делают.
 * Файл — MAX_CA_FILE или /etc/ssl/max/russian_trusted_root_ca.pem; годится и PEM, и DER.
 * Нет файла по умолчанию — тихо выходим: сертификат мог быть поставлен в систему.
 */
export function trustMaxCa(file = process.env.MAX_CA_FILE || DEFAULT_CA_FILE) {
  if (result) return result;
  const explicit = Boolean(process.env.MAX_CA_FILE);

  let pem;
  try {
    pem = new X509Certificate(readFileSync(file)).toString();
  } catch (e) {
    if (e.code === 'ENOENT' && !explicit) return (result = { ok: false, file, reason: 'нет файла' });
    const reason = e.code === 'ENOENT' ? 'нет файла' : `не читается как сертификат (${e.message})`;
    console.warn(`‼ MAX_CA_FILE=${file}: ${reason}. Запросы к API MAX упадут на проверке TLS.`);
    return (result = { ok: false, file, reason });
  }

  if (typeof tls.setDefaultCACertificates !== 'function') {
    console.warn(`‼ Node ${process.version} не умеет добавлять сертификаты на лету — обновите Node до 22.19+`);
    console.warn(`  или задайте в окружении сервиса NODE_EXTRA_CA_CERTS=${file}`);
    return (result = { ok: false, file, reason: 'старый Node' });
  }

  tls.setDefaultCACertificates([...tls.getCACertificates('default'), pem]);
  return (result = { ok: true, file });
}

const TLS_CODES = new Set([
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_UNTRUSTED', 'CERT_SIGNATURE_FAILURE',
]);

/** Понятное объяснение сетевой ошибки fetch для типовых поломок; null — если объяснять нечего. */
export function explainNetError(err, base) {
  const code = err?.cause?.code || err?.code;
  if (TLS_CODES.has(code)) {
    return `нет доверия к сертификату ${base} (${code}). Нужен корневой сертификат Минцифры: ` +
      `положите его в ${process.env.MAX_CA_FILE || DEFAULT_CA_FILE} — см. docs/max-bot-setup.md, раздел 2`;
  }
  if (code === 'ENOTFOUND' && /platform-api\.max\.ru/.test(base)) {
    return 'домен platform-api.max.ru отключён — уберите MAX_API_BASE или поставьте https://platform-api2.max.ru';
  }
  return null;
}
