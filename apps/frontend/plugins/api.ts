import createClient from "openapi-fetch";
import type { paths } from "../src/types/api";

/**
 * Разбирает `Set-Cookie` строку и достаёт из неё пару `name=value`
 * (без атрибутов вроде Path/HttpOnly), чтобы подставить новое значение
 * в исходящий Cookie-заголовок при повторном запросе на сервере.
 */
function parseSetCookiePair(setCookie: string): [string, string] | null {
  const separatorIndex = setCookie.indexOf("=");
  if (separatorIndex === -1) return null;
  const semicolonIndex = setCookie.indexOf(";");
  const name = setCookie.slice(0, separatorIndex).trim();
  const value = setCookie.slice(separatorIndex + 1, semicolonIndex === -1 ? undefined : semicolonIndex).trim();
  return name ? [name, value] : null;
}

/** Подставляет обновлённые cookie (по имени) в существующую строку Cookie-заголовка. */
function mergeCookieHeader(cookieHeader: string, updates: Record<string, string>): string {
  const seen = new Set<string>();
  const parts = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const name = part.slice(0, part.indexOf("=")).trim();
      if (name in updates) {
        seen.add(name);
        return `${name}=${updates[name]}`;
      }
      return part;
    });

  for (const [name, value] of Object.entries(updates)) {
    if (!seen.has(name)) parts.push(`${name}=${value}`);
  }

  return parts.join("; ");
}

/** Методы, у которых бэкенд требует парный CSRF-токен. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default defineNuxtPlugin(() => {
  const apiBase = useApiBase();
  const requestEvent = import.meta.server ? useRequestEvent() : undefined;

  /**
   * Парный CSRF-токен живёт здесь, в памяти приложения, и нигде больше: кука с
   * его парой — `HttpOnly`, из JS не читается, и это в схеме главное. Токен в
   * localStorage или в своей читаемой куке означал бы, что XSS снимает защиту
   * целиком.
   *
   * Состояние объявлено внутри фабрики плагина, а не в модуле: на SSR модуль
   * один на процесс, и токен одного пользователя уходил бы другому.
   */
  let csrfToken: string | null = null;

  async function fetchCsrfToken(): Promise<string | null> {
    try {
      const response = await fetch(`${apiBase}/api/auth/csrf-token`, {
        credentials: "include",
      });
      if (!response.ok) return null;

      const body = (await response.json()) as { csrfToken?: string };
      csrfToken = body.csrfToken ?? null;
      return csrfToken;
    } catch {
      return null;
    }
  }

  function ensureCsrfToken(): Promise<string | null> {
    return csrfToken ? Promise.resolve(csrfToken) : fetchCsrfToken();
  }

  /**
   * Сбрасывает токен, когда меняется сессия (вход, выход): бэкенд привязывает
   * парный токен к пользователю, и выданный до входа после входа уже не
   * подходит. Повтор при 403 ниже вытащил бы приложение и без этого, но ценой
   * лишнего отказа на каждом первом действии после входа.
   */
  function resetCsrfToken(): void {
    csrfToken = null;
  }

  /**
   * На сервере токен не нужен и взять его негде: единственный изменяющий вызов
   * с SSR — `POST /api/auth/refresh`, и он от проверки освобождён (@SkipCsrf).
   */
  const csrfApplies = (method: string) =>
    import.meta.client && MUTATING_METHODS.has(method.toUpperCase());

  /**
   * На SSR у нас нет браузерного cookie-jar: Set-Cookie от бэкенда нужно
   * вручную докинуть в ответ Nuxt-сервера, иначе браузер не увидит
   * обновлённый access_token после рефреша.
   */
  function forwardSetCookiesToBrowser(setCookies: string[]) {
    const res = requestEvent?.node?.res;
    if (!res || setCookies.length === 0) return;
    const existing = res.getHeader("set-cookie");
    const existingList = existing ? (Array.isArray(existing) ? existing.map(String) : [String(existing)]) : [];
    res.setHeader("set-cookie", [...existingList, ...setCookies]);
  }

  let refreshPromise: Promise<{ ok: boolean; cookies: Record<string, string> }> | null = null;

  /** Дедуплицирует параллельные 401-ответы: рефреш выполняется один раз. */
  function refreshSession(cookieHeader: string | null) {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const headers: Record<string, string> = {};
          if (cookieHeader) headers.cookie = cookieHeader;

          const response = await fetch(`${apiBase}/api/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers,
          });

          if (!response.ok) return { ok: false, cookies: {} };

          const setCookies = response.headers.getSetCookie?.() ?? [];
          if (import.meta.server) forwardSetCookiesToBrowser(setCookies);

          const cookies: Record<string, string> = {};
          for (const raw of setCookies) {
            const pair = parseSetCookiePair(raw);
            if (pair) cookies[pair[0]] = pair[1];
          }
          return { ok: true, cookies };
        } catch {
          return { ok: false, cookies: {} };
        }
      })();
      void refreshPromise.finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  /** Копия запроса с заголовком `x-csrf-token`; для GET — тот же запрос. */
  async function withCsrfToken(request: Request): Promise<Request> {
    if (!csrfApplies(request.method)) return request;

    const token = await ensureCsrfToken();
    if (!token) return request;

    const headers = new Headers(request.headers);
    headers.set("x-csrf-token", token);
    return new Request(request, { headers });
  }

  /**
   * Запрос к API вне типизированного клиента: загрузка файлов, вход, команды
   * запуска. Нужен затем, чтобы парный токен подставлялся в одном месте, —
   * иначе каждый новый `fetch` по месту оказывается без него и падает с 403
   * уже на пользователе.
   */
  async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const url = path.startsWith("http") ? path : `${apiBase}${path}`;

    const send = async (token: string | null) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("x-csrf-token", token);
      return fetch(url, { credentials: "include", ...init, headers });
    };

    const response = await send(csrfApplies(method) ? await ensureCsrfToken() : null);
    if (response.status !== 403 || !csrfApplies(method)) return response;

    const refreshed = await fetchCsrfToken();
    return refreshed ? send(refreshed) : response;
  }

  /**
   * Custom fetch для openapi-fetch: access-токен живёт всего 15 минут и
   * ничего его не обновляло, из-за чего после простоя (или SSR-рефреша
   * страницы) пользователя выкидывало на логин. Здесь при 401 пробуем
   * один раз обновить сессию через /api/auth/refresh и повторяем запрос.
   */
  const authFetch = async (request: Request): Promise<Response> => {
    const isRefreshCall = request.url.includes("/api/auth/refresh");
    const retryRequest = isRefreshCall ? null : request.clone();

    let response = await fetch(await withCsrfToken(request));

    // Токен мог устареть: сессия сменилась (вход, «выйти везде») или кука
    // истекла. Один повтор со свежим токеном, дальше — ошибка как есть.
    if (response.status === 403 && csrfApplies(request.method) && retryRequest) {
      const refreshed = await fetchCsrfToken();
      if (refreshed) {
        response = await fetch(await withCsrfToken(retryRequest.clone()));
      }
    }

    if (response.status !== 401 || isRefreshCall || !retryRequest) {
      return response;
    }

    const originalCookieHeader = request.headers.get("cookie");
    const { ok, cookies } = await refreshSession(originalCookieHeader);
    if (!ok) {
      return response;
    }

    // На сервере cookie в заголовке запроса зашиты явно (нет браузерного
    // jar), поэтому подменяем access_token/refresh_token на свежие перед
    // повтором. В браузере это не нужно — cookie-jar уже обновлён сам.
    if (import.meta.server && originalCookieHeader && Object.keys(cookies).length) {
      const mergedHeaders = new Headers(retryRequest.headers);
      mergedHeaders.set("cookie", mergeCookieHeader(originalCookieHeader, cookies));
      return fetch(new Request(retryRequest, { headers: mergedHeaders }));
    }

    return fetch(retryRequest);
  };

  const client = createClient<paths>({
    baseUrl: apiBase,
    credentials: "include",
    fetch: authFetch,
  });

  if (import.meta.server) {
    const headers = useRequestHeaders(["cookie"]);
    client.use({
      onRequest({ request }) {
        if (headers.cookie) {
          request.headers.set("cookie", headers.cookie);
        }
        return request;
      },
    });
  }

  return {
    provide: {
      api: client,
      apiFetch,
      /** Парный токен для запросов, которые уходят не через fetch (XHR). */
      csrfToken: ensureCsrfToken,
      /** Вызывается при смене сессии: вход, выход. */
      csrfReset: resetCsrfToken,
    },
  };
});
