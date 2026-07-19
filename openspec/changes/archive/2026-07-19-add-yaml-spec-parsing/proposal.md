## Why

Импорт OpenAPI-спецификаций сейчас принимает только JSON: `SsrfGuard.fetchSpec()` безусловно вызывает `JSON.parse(text)` и падает с «Spec response is not valid JSON» на любом YAML-документе, хотя `Accept` уже заявляет `application/yaml`. YAML — де-факто стандартный и более распространённый формат OpenAPI-документов, поэтому значительная часть публичных спецификаций не импортируется вообще.

## What Changes

- Распознавать YAML-тело ответа (по `Content-Type: application/yaml`/`text/yaml` и, при отсутствии явного типа, по первому непустому символу) и парсить его в объект наравне с JSON.
- Использовать единый объектный результат для последующего `OpenApiParserService.parse()` — сам парсер эндпоинтов остаётся без изменений, так как уже работает с разобранным объектом.
- Уточнить сообщение об ошибке: «Spec response is not valid JSON or YAML», чтобы отражать оба поддерживаемых формата.
- Добавить `js-yaml` как явную backend-зависимость (сейчас доступен только транзитивно через `@readme/openapi-parser`).
- Покрыть новый путь парсинга тестами (`ssrf-guard.spec.ts`).

## Capabilities

### New Capabilities

_Нет — расширяется существующая возможность импорта._

### Modified Capabilities

- `api-app-management`: требование «Создание приложения с импортом OpenAPI» расширяется — спецификация принимается в JSON **или** YAML; добавляются сценарии для YAML-импорта и для тела без явного `Content-Type`.

## Impact

- **Код**: `apps/backend/src/apps/ssrf-guard.ts` (ветвление парсинга в `fetchSpec()`), `apps/backend/package.json` (добавление `js-yaml`).
- **Без изменений**: `openapi-parser.ts`, `base-url.ts`, `apps.service.ts`, фронтенд `new.vue` — они работают с уже разобранным объектом.
- **Тесты**: расширение `apps/backend/test/ssrf-guard.spec.ts` кейсами YAML и смешанного `Content-Type`.
- **Совместимость**: обратно совместимо — JSON продолжает работать как прежде; поведение для ранее падавших YAML-ответов меняется с ошибки на успешный импорт.
