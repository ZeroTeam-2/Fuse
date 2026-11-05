import ipaddr from "ipaddr.js";

/**
 * Признак «конфигурация смотрит наружу».
 *
 * Строгий режим валидации окружения включается не по `NODE_ENV`, а по тому, на
 * что указывают адреса в конфигурации. Причина конкретная: утёкший профиль этого
 * проекта был `NODE_ENV=development` при внешнем Mongo, очереди в Yandex Cloud и
 * хранилище в Timeweb — ни одна проверка, обусловленная production, в нём бы не
 * сработала. Самоназвание окружения не тот признак, которому можно доверять;
 * адрес базы — тот.
 */

/** Переменные, по адресам в которых определяется внешность конфигурации. */
export const EXTERNAL_CONFIG_VARS = [
  "MONGODB_URL",
  "AWS_ENDPOINT_URL",
  "AWS_SQS_QUEUE_URL",
  "S3_URL",
] as const;

export type ExternalConfigVar = (typeof EXTERNAL_CONFIG_VARS)[number];

/** Хост, найденный во внешнем адресе: переменная и само значение хоста. */
export interface ExternalHostHit {
  variable: ExternalConfigVar;
  host: string;
}

/**
 * Хосты из значения переменной. Значение может быть и полным URL
 * (`http://localstack:4566/000000000000/queue`), и голым хостом (`S3_URL=localhost`),
 * и строкой подключения с набором хостов реплика-сета
 * (`mongodb://user:pass@a:27017,b:27017/db?authSource=admin`), поэтому разбор
 * ручной: `new URL` на перечислении хостов через запятую падает.
 */
export function extractHosts(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const schemeAt = trimmed.indexOf("://");
  const withoutScheme = schemeAt === -1 ? trimmed : trimmed.slice(schemeAt + 3);

  // Путь, query и fragment к адресации хоста не относятся.
  const authority = withoutScheme.split(/[/?#]/)[0] ?? "";
  // Креды отрезаем по последнему `@`: пароль сам может содержать `@`.
  const atAt = authority.lastIndexOf("@");
  const hostPart = atAt === -1 ? authority : authority.slice(atAt + 1);

  return hostPart
    .split(",")
    .map((host) => stripPort(host))
    .filter((host) => host.length > 0);
}

function stripPort(host: string): string {
  const trimmed = host.trim();

  // IPv6-литерал в URL приходит в скобках: [::1]:27017.
  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]");
    return closing === -1 ? trimmed.slice(1) : trimmed.slice(1, closing);
  }

  const colon = trimmed.lastIndexOf(":");
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

/**
 * Внешним считается публичный IP-литерал либо доменное имя с точкой вне
 * `localhost` и `.local`. Односегментные имена — сервисы compose (`mongo`,
 * `localstack`, `garage`), приватные диапазоны и `host.docker.internal` —
 * локальные.
 */
export function isExternalHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized) return false;

  if (normalized === "localhost" || normalized.endsWith(".localhost")) return false;
  if (normalized === "host.docker.internal") return false;
  if (normalized.endsWith(".local")) return false;

  if (ipaddr.isValid(normalized)) {
    let address = ipaddr.parse(normalized);
    // IPv4-mapped IPv6 (::ffff:203.0.113.1) классифицируем по вложенному адресу,
    // иначе публичный адрес в такой записи сойдёт за служебный.
    if (address.kind() === "ipv6") {
      const v6 = address as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        address = v6.toIPv4Address();
      }
    }
    return address.range() === "unicast";
  }

  // Односегментное имя резолвится только внутри сети compose или через /etc/hosts.
  return normalized.includes(".");
}

/**
 * Все внешние адреса в конфигурации. Возвращается список, а не флаг, чтобы
 * сообщение об ошибке называло переменную и хост: «строгий режим включился» без
 * указания причины не подсказывает, что именно править. Сам признак строгого
 * режима собирается в `env.schema.ts` — одно место, где он определён.
 */
export function findExternalHosts(
  config: Partial<Record<ExternalConfigVar, string>>,
): ExternalHostHit[] {
  const hits: ExternalHostHit[] = [];

  for (const variable of EXTERNAL_CONFIG_VARS) {
    const value = config[variable];
    if (!value) continue;

    for (const host of extractHosts(value)) {
      if (isExternalHost(host)) {
        hits.push({ variable, host });
      }
    }
  }

  return hits;
}
