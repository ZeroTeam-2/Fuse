# Tasks — parse-outputs-from-response-example

## 1. Парсер

- [x] 1.1 `openapi-parser.ts`: расширить чтение content-объекта (`getFirstContent` — схема + `example` + `examples`), в `extractOutputs` добавить фолбэк: пустой результат разбора схемы → вывод полей из примера (`content.example` → `schema.example` → первый `examples[*].value`)
- [x] 1.2 Вывод полей из значения примера: объект → поля по ключам (тип по JS-типу, значение в `ex`), массив объектов → `isArray` + поля элемента, вложенный массив объектов → `items` (один уровень), массив скаляров → `array` без `items`

## 2. Тесты и проверка

- [x] 2.1 Unit-тесты `openapi-parser.spec.ts`: пустая схема + `content.example` (кейс FastAPI), пример-массив (коллекция), `schema.example`, именованные `examples`, приоритет настоящей схемы над примером — 5 новых тестов, весь бэкенд 179 ✓
- [x] 2.2 Проверить разбор реальной `api-1.yaml` (llm-doc-recognizer): `/task/{task_id}` получает выходы `status:string`, `result:string`; схемные endpoints (`/pdf/process` → `task_id`, `status`) не изменились
