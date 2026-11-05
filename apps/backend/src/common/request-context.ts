import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Контекст обработки запроса. Нужен ровно для одного: чтобы запись лога из любой
 * точки обработки несла идентификатор запроса, не прокидывая его параметром по
 * всей цепочке вызовов (сервисы → клиенты → утилиты).
 *
 * Хранилище заполняется `requestIdMiddleware` на входе и доступно всем, кто
 * выполняется внутри запроса, включая глобальный фильтр исключений.
 */
export interface RequestContext {
  requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Идентификатор текущего запроса или `undefined` вне запроса (воркер, старт). */
export function currentRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
