## 1. Зависимости

- [x] 1.1 Добавить `js-yaml` (`^4`) в `dependencies` в `apps/backend/package.json`
- [x] 1.2 Добавить `@types/js-yaml` в `devDependencies` в `apps/backend/package.json`
- [x] 1.3 Выполнить `pnpm install` в корне и убедиться, что дедупликация не разрешила вторую копию `js-yaml`

## 2. Разбор тела спецификации

- [x] 2.1 В `apps/backend/src/apps/ssrf-guard.ts` импортировать `load` из `js-yaml`
- [x] 2.2 Реализовать приватный помощник `parseSpecBody(text, contentType): Record<string, unknown>` с двухуровневым определением формата: по `Content-Type` (`json` → JSON, `yaml` → YAML), при неинформативном типе — body sniffing по первому непробельному символу (`{`/`[` → JSON, иначе → YAML)
- [x] 2.3 Реализовать мягкий fallback: при провале разбора по определённому формату попробовать альтернативный
- [x] 2.4 Добавить проверку `typeof result === "object" && result !== null` после разбора; иначе выбрасывать ошибку
- [x] 2.5 Обновить сообщение об ошибке на `"Spec response is not valid JSON or YAML"`
- [x] 2.6 Заменить блок `JSON.parse(text)` (`ssrf-guard.ts:149-153`) вызовом `parseSpecBody(text, response.headers.get("content-type") ?? "")`

## 3. Тесты

- [x] 3.1 В `apps/backend/test/ssrf-guard.spec.ts` добавить группу `describe("fetchSpec")` с моком `globalThis.fetch`
- [x] 3.2 Тест: успешный разбор JSON с `Content-Type: application/json`
- [x] 3.3 Тест: успешный разбор YAML с `Content-Type: application/yaml`
- [x] 3.4 Тест: успешный разбор YAML при `Content-Type: text/plain` (body sniffing по содержимому)
- [x] 3.5 Тест: fallback — YAML-тело ошибочно определено как JSON, успешно разбирается через повторную попытку YAML
- [x] 3.6 Тест: невалидное тело в обоих форматах → `BadRequestException` с сообщением «Spec response is not valid JSON or YAML»
- [x] 3.7 Тест: результат разбора, не являющийся объектом (например, YAML-скаляр) → `BadRequestException`

## 4. Проверка

- [x] 4.1 Запустить `pnpm --filter @fuse/backend typecheck` и убедиться в отсутствии ошибок типов
- [x] 4.2 Запустить `pnpm --filter @fuse/backend test` и убедиться, что все тесты (вкл. новые) проходят
- [x] 4.3 Сверить, что существующие JSON-кейсы импорта не изменили поведение (регрессия отсутствует)
