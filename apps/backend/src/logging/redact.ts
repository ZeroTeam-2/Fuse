/**
 * Маскирование чувствительных значений в записях лога.
 *
 * Применяется там, где лог фактически пишется (`LoggingService`), а не на вызове:
 * маскировать на каждом `logger.*` по месту нельзя — забудут в первом же новом
 * сервисе. Это тем важнее, что при заданном `LOG_COLLECTOR_URL` записи уходят на
 * внешний приёмник, то есть выходят за границу системы.
 */

const REDACTED = "[redacted]";

/**
 * Email. Маскируется целиком: частичная маскировка («u***@example.com») для
 * адреса в небольшом домене восстанавливается перебором.
 *
 * Последняя метка домена обязана быть буквенной — иначе под шаблон попадает
 * `пакет@версия` из путей pnpm (`body-parser@2.2.0`), и stack trace в логе
 * превращается в кашу из маркеров ровно там, где он нужен для разбора.
 */
const EMAIL = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g;

/** JWT: три base64url-сегмента через точку. Access- и refresh-токены этого вида. */
const JWT = /\beyJ[\w-]*\.[\w-]+\.[\w-]+/g;

/** Имена полей, значение которых не попадает в лог ни в каком виде. */
const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "refreshtoken",
  "accesstoken",
  "refresh_token",
  "access_token",
  "authorization",
  "cookie",
  "set-cookie",
  "jwt_secret",
  "client_secret",
]);

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Маскирование внутри строки: email и JWT-подобные последовательности. */
export function redactString(value: string): string {
  return value.replace(EMAIL, "[redacted:email]").replace(JWT, "[redacted:jwt]");
}

/**
 * Маскирование произвольного значения записи лога. Обходит объекты и массивы;
 * значение поля с чувствительным именем заменяется целиком, не разбираясь.
 *
 * `seen` защищает от циклических ссылок: объект запроса или ошибки, попавший в
 * meta, ссылается сам на себя.
 */
export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(item, seen);
  }
  return result;
}
