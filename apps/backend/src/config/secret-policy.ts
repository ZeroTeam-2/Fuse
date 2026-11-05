import { createHash } from "node:crypto";

/**
 * Политика значений секретов: отозванные, плейсхолдерные и вырожденные значения.
 *
 * Отозванные значения хранятся хэшами. Внести сам секрет в репозиторий значило бы
 * вернуть его туда тем же действием, которым его оттуда убирают, — поэтому в коде
 * только sha256, посчитанный до удаления файла окружения.
 */

/**
 * sha256 значений, утёкших в публичный репозиторий и подлежащих ротации.
 * Источник — таблица в `openspec/changes/harden-security-posture/tasks.md` (1.9).
 * Приложение не стартует ни с одним из них, независимо от окружения:
 * скомпрометированное значение скомпрометировано и на машине разработчика.
 */
export const REVOKED_SECRET_HASHES: ReadonlySet<string> = new Set([
  // MONGODB_URL (строка подключения к внешнему серверу вместе с паролем root)
  "ed46c443893b686ff123ba490534dba602cacc32262b35ee263444214a12e3ed",
  // AWS_ACCESS_KEY_ID
  "0478a4966e517e2170aa73ecf6639af8a76460907894814aabaa3089505cd92a",
  // AWS_SECRET_ACCESS_KEY
  "9093f87aeaa188be5771708ac18f3b213d5e1b18901325f72d1a319e36ae5acf",
  // S3_ACCESS_KEY
  "82100458573677ff1c7cf23fa667ddfe1b144a786fbc241364fbe02ca48d7f04",
  // S3_SECRET_KEY
  "bcb5442c6837f8de7e65cb748459052c9f0d739e7edfb2b3ac5b6d795e09e387",
  // YANDEX_CLIENT_SECRET
  "ba2a655f52a7110c6f6e50b6542583cec6c563ab51ae7648bf406729c60ed9ed",
  // JWT_SECRET и NUXT_SESSION_SECRET — до ротации это было одно значение на две роли
  "67b10701b534be9b9908f01f2dd1821237bb70189a69eb6199aaa57c4535acdd",
]);

/**
 * Значения-плейсхолдеры: образцы окружения, дефолты локальных контейнеров и
 * типовые заглушки. В строгом режиме ни одно из них не является секретом.
 *
 * Список составлен по `.env.example` и `.env.local.example`; проверка идёт по
 * значению целиком, чтобы осмысленный секрет не отбился из-за подстроки.
 */
const PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  "test",
  "secret",
  "password",
  "placeholder",
  "example",
  "todo",
  "minioadmin",
  "fuse-local-dev-secret",
  "fuse-local-dev-login",
]);

/** Подсказки-инструкции в образцах окружения: `<generate-via-openssl-rand-hex-48>`. */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /^<.*>$/, // значение в угловых скобках — инструкция, а не значение
  /openssl/i,
  /generate/i,
  /^change[-_]?me$/i,
  /^x{3,}$/i,
  /^your[-_]/i,
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Значение отозвано и подлежит ротации.
 *
 * `revoked` параметризован намеренно: по хэшу прообраз не восстанавливается, и
 * без подстановки своего списка проверить саму проверку тестом нечем. В коде
 * приложения аргумент не передаётся.
 */
export function isRevokedSecret(
  value: string,
  revoked: ReadonlySet<string> = REVOKED_SECRET_HASHES,
): boolean {
  if (!value) return false;
  return revoked.has(sha256(value));
}

/** Значение — плейсхолдер из образца окружения или дефолт локального контейнера. */
export function isPlaceholderSecret(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;

  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return true;

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Минимум различных символов в секрете подписи. Значение из `openssl rand -hex 48`
 * даёт 16 различных символов, base64 — больше; порог в 5 отсекает вырожденные
 * строки вида «aaaa…» и «abababab…», не задевая ни одно случайное значение.
 */
const MIN_DISTINCT_CHARS = 5;

/** Значение нужной длины, но собранное из нескольких повторяющихся символов. */
export function hasDegenerateAlphabet(value: string): boolean {
  if (!value) return false;
  return new Set(value).size < MIN_DISTINCT_CHARS;
}
