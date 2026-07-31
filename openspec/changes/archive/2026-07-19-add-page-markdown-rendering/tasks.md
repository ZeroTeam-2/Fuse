# Tasks: Блок «Текст» — рендеринг Markdown

## 1. Модель и зависимости

- [x] 1.0 Добавить опциональное поле `format?: "text" | "markdown"` в `PageBlock` (`packages/shared/src/types/index.ts`) с doc-комментарием «только `paragraph`»
- [x] 1.1 Добавить `marked` в зависимости `apps/frontend` (зафиксировать мажорную версию), `pnpm install`
- [x] 1.2 Расширить `apps/frontend/utils/sanitizeRichText.ts` поддержкой `<a>`: сохранять `href` только со схемами `http/https/mailto`, принудительно добавлять `rel="noopener noreferrer" target="_blank"`; остальные атрибуты по-прежнему резать

## 2. Утилита рендера Markdown

- [x] 2.1 Создать `apps/frontend/utils/renderMarkdown.ts`: нормализация литеральных `\\`, `\n`, `\t`, `\"` (сначала `\\`) → `marked` c `breaks: true` → `sanitizeRichText`
- [x] 2.2 Юнит-тесты утилиты: экранированный `\n` из API, жирный/заголовок/список, `<script>` и `javascript:`-ссылка вырезаются, `https`-ссылка получает `rel`/`target`

## 3. Конструктор и PageRunner

- [x] 3.0 В палитре `apps/frontend/components/scenario/PageEditor.vue` переименовать блок `paragraph` «Абзац» → «Текст» (и упоминания «абзаца» в подписях/плейсхолдерах конструктора, включая `PageParagraph.vue`)
- [x] 3.0a В инспекторе `PageEditor.vue` добавить переключатель формата («Обычный текст» / «Markdown») в секции свойств блока `paragraph`, патчить `format` выбранного блока
- [x] 3.1 В `apps/frontend/components/run/PageRunner.vue` раздвоить ветку `paragraph` по `block.format`: при `"markdown"` — `v-html` с результатом `renderMarkdown(displayValue(block))`, иначе — прежняя интерполяция с `whitespace-pre-wrap`
- [x] 3.2 Добавить typography-стили для вложенной разметки Markdown-абзаца (заголовки, списки, `code`/`pre`, цитаты, ссылки) в духе существующего DS

## 4. Проверка

- [x] 4.1 Прогнать существующие тесты и typecheck фронтенда
- [x] 4.2 Ручная проверка на сиде «Демо: страницы»: у Markdown-блока статический текст и значение из результата API с экранированным `\n` отображаются отформатированными; блок без настройки рендерится как раньше; конструктор по-прежнему редактирует сырой текст
