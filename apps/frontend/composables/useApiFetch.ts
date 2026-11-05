/**
 * Запрос к API вне типизированного клиента: загрузка файлов, вход, команды
 * запуска. Подставляет парный CSRF-токен и повторяет запрос один раз, если
 * сервер токен не принял; реализация — в `plugins/api.ts`.
 *
 * Приведение типа — как в `useApi()`: типы инъекций плагина Nuxt до вызывающего
 * кода не доходят.
 */
export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function useApiFetch(): ApiFetch {
  const { $apiFetch } = useNuxtApp();
  return $apiFetch as unknown as ApiFetch;
}

/**
 * Парный CSRF-токен из памяти приложения — для запросов, которые уходят не
 * через fetch (XHR в загрузке файлов: ему нужен `upload.onprogress`).
 */
export function useCsrfToken(): () => Promise<string | null> {
  const { $csrfToken } = useNuxtApp();
  return $csrfToken as unknown as () => Promise<string | null>;
}

/**
 * Сброс парного токена при смене сессии: бэкенд привязывает его к
 * пользователю, и токен, полученный до входа, после входа не подходит.
 */
export function useCsrfReset(): () => void {
  const { $csrfReset } = useNuxtApp();
  return $csrfReset as unknown as () => void;
}
