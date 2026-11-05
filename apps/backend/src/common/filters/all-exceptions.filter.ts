import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { currentRequestId } from "../request-context";
import { REQUEST_ID_HEADER } from "../middleware/request-id.middleware";

/**
 * Глобальный фильтр исключений.
 *
 * `HttpException` прокидывается как есть — поведение существующих обработчиков
 * (`NotFoundException("Scenario not found")` и остальных) не меняется. Всё
 * остальное — незапланированная ошибка: stack уходит в server-side лог, клиент
 * получает 500 с идентификатором запроса и без диагностики.
 *
 * Без фильтра наружу уезжают тексты, которых клиент видеть не должен: сообщения
 * драйвера MongoDB с частями строки подключения, ошибки S3-клиента с именем
 * бакета и endpoint'ом, тела ответов стороннего API. Идентификатор в теле — то,
 * что связывает ответ с записью в логе: без него маскировка ошибки превращается
 * в потерю диагностики.
 */
/**
 * Ошибка, которую Express сам считает клиентской: числовой 4xx-статус и
 * `expose: true`. Такой набор ставят `http-errors` и `body-parser`; у ошибок
 * драйверов его нет.
 */
function asExposedClientError(
  exception: unknown,
): { status: number; message: string } | undefined {
  if (typeof exception !== "object" || exception === null) return undefined;

  const err = exception as { status?: unknown; statusCode?: unknown; expose?: unknown; message?: unknown };
  if (err.expose !== true) return undefined;

  const status = typeof err.status === "number" ? err.status : err.statusCode;
  if (typeof status !== "number" || status < 400 || status >= 500) return undefined;

  return {
    status,
    message: typeof err.message === "string" ? err.message : "Bad request",
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // WebSocket и прочие транспорты до HTTP-ответа не дотягиваются: гейтвеи
    // обрабатывают ошибки сами, здесь перехватывать нечего.
    if (host.getType() !== "http") throw exception;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(
        typeof body === "string" ? { statusCode: status, message: body } : body,
      );
      return;
    }

    const requestId = currentRequestId() ?? res.getHeader(REQUEST_ID_HEADER);

    // Ошибки уровня Express — не HttpException, но статус у них осмысленный:
    // body-parser на превышении лимита тела даёт 413, на битом JSON — 400, и
    // помечает их `expose: true` (соглашение http-errors: «текст можно показать
    // клиенту»). Без этой ветки клиент получал бы на слишком большое тело
    // непрозрачную 500 вместо «payload too large», то есть терял бы причину.
    // Ошибки драйверов (Mongo, S3) `expose` не ставят и уходят в 500 ниже.
    const clientError = asExposedClientError(exception);
    if (clientError) {
      res.status(clientError.status).json({
        statusCode: clientError.status,
        message: clientError.message,
        requestId: String(requestId ?? ""),
      });
      return;
    }

    const req = ctx.getRequest<{ method?: string; originalUrl?: string }>();

    this.logger.error(
      `Unhandled exception on ${req?.method ?? "?"} ${req?.originalUrl ?? "?"} [${
        String(requestId)
      }]`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      requestId: String(requestId ?? ""),
    });
  }
}
