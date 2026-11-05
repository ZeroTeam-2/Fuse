import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { requestContextStorage } from "../request-context";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Формат входящего идентификатора. Значение приходит снаружи и попадает и в
 * заголовок ответа, и в строки лога, поэтому принимаем только безопасный
 * алфавит и ограниченную длину: иначе через заголовок можно подмешать в лог
 * перевод строки и подделать запись.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Идентификатор запроса: берётся из `x-request-id`, если проходит проверку
 * формата (так сквозная трассировка через прокси не разрывается), иначе
 * генерируется. Уходит и в заголовок ответа, и в `AsyncLocalStorage` — по нему
 * сопровождение находит запись лога по идентификатору из ответа 500.
 *
 * Регистрируется первым, до остальных middleware: ошибка в любом из них должна
 * попадать в лог уже с идентификатором.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

  const requestId = candidate && SAFE_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  requestContextStorage.run({ requestId }, () => {
    next();
  });
}
