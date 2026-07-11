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
  let specOrigin: URL;
  try {
    specOrigin = new URL(openapiUrl);
  } catch {
    return undefined;
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

  if (spec?.host) {
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
  return specOrigin.origin;
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
