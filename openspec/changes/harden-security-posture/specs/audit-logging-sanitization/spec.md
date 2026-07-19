## ADDED Requirements

### Requirement: Глобальный AllExceptionsFilter
Система SHALL регистрировать глобальный `AllExceptionsFilter` через `APP_FILTER`. Для `HttpException` фильтр прокидывает статус и message. Для всех прочих ошибок фильтр логирует stack server-side и отвечает клиенту `500 Internal Server Error` с уникальным correlation UUID (не раскрывая stack/message/пути).

#### Scenario: Необработанное исключение
- **WHEN** в обработчике запроса выбрасывается не-HttpException (например, Mongoose CastError)
- **THEN** клиент получает `500` с телом `{ statusCode: 500, message: "Internal server error", correlationId: "<uuid>" }`, а в server-side логе появляется stack trace с тем же correlationId

#### Scenario: HttpException прокидывается
- **WHEN` контроллер выбрасывает `NotFoundException("Scenario not found")`
- **THEN** клиент получает `404` с `{ statusCode: 404, message: "Scenario not found" }`

### Requirement: Correlation ID на каждый запрос
Каждый HTTP-запрос SHALL получать уникальный `correlationId` (UUID v4), генерируемый middleware. ID MUST прокидываться в `LoggingService` (через `AsyncLocalStorage` или request-scoped provider) и добавляться в response-заголовок `x-request-id`. Если входящий запрос содержит заголовок `x-request-id`, система SHOULD использовать его (но перегенерировать при невалидном формате).

#### Scenario: Ответ содержит correlation ID
- **WHEN** клиент делает запрос без заголовка `x-request-id`
- **THEN** ответ содержит заголовок `x-request-id` с UUID v4

#### Scenario: Логи содержат correlation ID
- **WHEN** в обработке запроса вызывается `logger.info(...)` и запрос падает с 500
- **THEN** в server-side логах каждая строка для этого запроса содержит одно и то же `correlationId`, совпадающее с `x-request-id` в ответе

### Requirement: Redactor для PII в логах
`LoggingService` SHALL применять redactor к полям лог-entries перед записью: emails маскируются (`a***@example.com`), поля `password`/`secret`/`token`/`refreshToken`/`accessToken` заменяются на `[REDACTED]`, JWT-паттерны (`eyJ...`) маскируются.

#### Scenario: Логирование email
- **WHEN** сервис вызывает `logger.info("User logged in", { email: "user@example.com" })`
- **THEN** в финальной лог-записи поле `email` содержит `u***@example.com`

#### Scenario: Логирование токена
- **WHEN` в лог попадает объект с полем `accessToken: "eyJhbG..."`
- **THEN` в финальной записи поле `accessToken` содержит `[REDACTED]`

### Requirement: Обрезка upstream error bodies
В `worker.service.ts` (и любых других местах, где сохраняются error bodies из upstream-вызовов) система SHALL обрезать текст ошибки до 200 символов перед записью в БД (`stepResults[].error`, `run.error`). Полный текст MUST сохраняться только в server-side логах.

#### Scenario: Длинный upstream error
- **WHEN` upstream API возвращает 500 с body из 5KB
- **THEN` в `stepResults[].error` сохраняется строка длиной ≤ 203 символа (200 + `...`)

### Requirement: Санитизация SQS-сообщений
Worker SHALL валидировать структуру SQS-сообщения перед передачей в обработку: `runId` MUST соответствовать формату `/^[a-f\d]{24}$/` (MongoDB ObjectId). Невалидные сообщения MUST перемещаться в DLQ без повторных попыток.

#### Scenario: Невалидный runId
- **WHEN` worker получает SQS-сообщение с `{ runId: "not-an-id" }`
- **THEN` сообщение отклоняется (без retry) и попадает в DLQ, в лог пишется warning

### Requirement: Санитизация marketplace-ответа
Публичные marketplace-эндпоинты SHALL НЕ возвращать поля `consts`, `blockedReason`, внутренние `appId`/`endpointId` шагов. В ответе MUST оставаться только необходимая для отображения мета-информация.

#### Scenario: Публичный ответ без секретов
- **WHEN` неаутентифицированный пользователь запрашивает `GET /api/marketplace/:id`
- **THEN** ответ не содержит полей `consts`, `blockedReason`, и шаги не раскрывают `appId`/`endpointId`

### Requirement: Защита от ReDoS в marketplace search
Marketplace search endpoint SHALL экранировать пользовательский input перед передачей в `$regex` MongoDB-запрос (либо использовать текстовый индекс). Катастрофическая backtracking MUST быть невозможна.

#### Scenario: Malicious regex pattern
- **WHEN** атакующий отправляет `?search=(a%2B)%2B$` (т.е. `(a+)+$`)
- **THEN** MongoDB-запрос использует экранированный паттерн и возвращает результаты (или пустой список), без зависания worker-а
