/**
 * Правило вывода базового URL приложения — единственный источник истины.
 *
 * Импортируется и парсером (при импорте/реимпорте спецификации), и скриптом
 * бэкфилла, поэтому модуль намеренно свободен от декораторов и Nest-импортов:
 * скрипт запускается голым `node` (type stripping), который декораторы не умеет.
 */

interface SpecLike {
  // OpenAPI 3: servers[].url — абсолютный ЛИБО относительный (тогда
  // разрешается относительно места публикации самого документа); может
  // содержать переменные-шаблоны вида "https://{region}.api.com".
  servers?: {
    url?: string;
    variables?: Record<string, { default?: string }>;
  }[];
  // Swagger 2: host + basePath, схема берётся из URL спецификации.
  host?: string;
  basePath?: string;
}

function normalize(url: URL): string {
  const href = url.href;
  return href.endsWith("/") ? href.slice(0, -1) : href;
}

/**
 * Подставляет значения по умолчанию для переменных сервера. `new URL` считает
 * "{region}.api.com" валидным хостом, поэтому неподставленный шаблон молча
 * доехал бы до `fetch` и упал там на DNS — такой URL лучше отбраковать сразу.
 */
function substituteServerVariables(
  url: string,
  variables?: Record<string, { default?: string }>,
): string | undefined {
  const resolved = url.replace(/\{(\w+)\}/g, (match, name: string) => {
    return variables?.[name]?.default ?? match;
  });
  return resolved.includes("{") ? undefined : resolved;
}

/**
 * @param spec       разобранная спецификация (может быть пустой/битой)
 * @param openapiUrl URL, по которому спецификация была скачана
 * @returns абсолютный базовый URL, либо undefined, если вывести его нельзя
 */
export function deriveBaseUrl(
  spec: SpecLike | null | undefined,
  openapiUrl: string,
): string | undefined {
  // Пустой/невалидный URL спеки — случай импорта из файла: абсолютный
  // servers[0].url всё ещё выводим, относительному не от чего резолвиться.
  let specOrigin: URL | undefined;
  try {
    specOrigin = new URL(openapiUrl);
  } catch {
    specOrigin = undefined;
  }

  const server = spec?.servers?.[0];
  if (server?.url) {
    const serverUrl = substituteServerVariables(server.url, server.variables);
    if (serverUrl) {
      try {
        return normalize(new URL(serverUrl, specOrigin));
      } catch {
        // Не разобрался — падаем на origin документа ниже.
      }
    }
  }

  if (spec?.host && specOrigin) {
    try {
      const base = new URL(`${specOrigin.protocol}//${spec.host}`);
      if (spec.basePath) {
        base.pathname = spec.basePath;
      }
      return normalize(base);
    } catch {
      // то же — падаем на origin
    }
  }

  // Спецификации без `servers` (типично для FastAPI: документ отдаётся по
  // https://host/openapi.json, а API живёт на том же origin).
  return specOrigin?.origin;
}

/** Имя окружения по умолчанию — обязательное и неудаляемое. */
export const PROD_ENV_NAME = "Prod";
/** Ключ базовой переменной окружения — абсолютного адреса API. */
export const BASE_URL_VAR_KEY = "baseUrl";

interface VariableLike {
  key: string;
  value: string;
}
interface EnvironmentLike {
  id?: string;
  name?: string;
  variables?: VariableLike[];
}
interface AppLike {
  baseUrl?: string;
  environments?: EnvironmentLike[];
}

/** Абсолютный ли это http(s)-URL с хостом (localhost допускается). */
export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.host;
  } catch {
    return false;
  }
}

/** Значение переменной `baseUrl` окружения, если задано. */
export function environmentBaseUrl(env: EnvironmentLike | undefined): string | undefined {
  return env?.variables?.find((v) => v.key === BASE_URL_VAR_KEY)?.value || undefined;
}

/**
 * Базовый URL приложения для исполнения: выбранное окружение → Prod → `baseUrl`
 * приложения (обратная совместимость с приложениями без окружений).
 */
export function resolveAppBaseUrl(
  app: AppLike,
  environmentId?: string,
): string | undefined {
  const envs = app.environments ?? [];

  if (environmentId) {
    const chosen = envs.find((e) => e.id === environmentId);
    const url = environmentBaseUrl(chosen);
    if (url) return url;
  }

  const prod = envs.find((e) => e.name === PROD_ENV_NAME);
  const prodUrl = environmentBaseUrl(prod);
  if (prodUrl) return prodUrl;

  return app.baseUrl;
}

/**
 * Присоединяет путь эндпоинта к базовому URL, сохраняя base path приложения:
 * ("https://api.com/v1", "/collections") → "https://api.com/v1/collections".
 */
export function joinBaseUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  base.pathname = `${basePath}${suffix}`;
  return base.href;
}
