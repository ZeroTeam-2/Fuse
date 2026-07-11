## Why

В `assets/Fuse Design System` появился завершённый брендовый набор Fuse Design System: токены (цвет/типографика/отступы/радиусы/тени), 26 компонентов и полный UI-kit всех экранов продукта. Текущий фронтенд (`apps/frontend`, Nuxt 3 + Vue 3 + Tailwind) свёрстан на временных scoped-стилях с индиго-акцентом (`#6366f1`) и шрифтами Inter / Plus Jakarta — это расходится с брендом (кримсон `#e11d48`, Golos Text, near-monochrome zinc). Нужно привести весь фронтенд к дизайн-системе.

Дизайн-система отдаётся в формате **React JSX**, а проект — **Vue/Nuxt**. Поэтому внедрение — это порт компонентов JSX → Vue SFC (Tailwind-классы переносятся почти 1:1, так как оба стека на Tailwind), а затем пересборка страниц на новых компонентах. Поведение продукта не меняется — это визуальный редизайн.

## What Changes

- **Фундамент**: подключить токены дизайн-системы (`tokens/*.css`) во фронтенд, обновить `tailwind.config.ts` (шрифты Golos Text + JetBrains Mono; палитра rose/zinc/green/violet — Tailwind-дефолты уже совпадают с токенами), заменить шрифты в `nuxt.config.ts` (Google Fonts CDN), переработать `layouts/default.vue`.
- **Компоненты (изолированно)**: портировать 26 компонентов DS в `apps/frontend/components/ui/` как Vue SFC, сохранив имена и props. Порядок — по зависимостям (core → forms → navigation → data → cards → feedback). Каждый верифицируется на dev-песочнице до сборки страниц.
- **Страницы**: переписать существующие страницы на новые компоненты, сняв старые scoped-стили с индиго. Эталон разметки — `assets/Fuse Design System/ui_kits/fuse-app/*.jsx`.
- **Иконки**: заменить самописные глифы на Lucide через `lucide-vue-next`, обёрнутый в компонент `Icon`.

## Capabilities

### New Capabilities

(нет новых capabilities — визуальный редизайн существующего UI; функциональные требования marketplace / scenario-builder / api-app-management / auth-profile / step-pages не меняются)

### Modified Capabilities

Изначально предполагалось, что поведенческие спеки не затрагиваются (только презентационный слой). По ходу работ владелец принял два продуктовых решения, которые меняют поведение, — они отражены в дельтах `specs/`:

- `auth-profile`: вход — **модалка** с любой страницы, а не отдельная страница `/login`; гость видит маркетплейс и карточки сценариев, но запуск и приватные разделы требуют входа (пункты меню приватных разделов гостю не показываются).
- `marketplace`: страница карточки публична, и публичное представление опубликованного сценария включает его **шаги** — чтобы гость видел вкладку «Запуск» с превью, а не ошибку доступа.

## Impact

- **Новое**: `apps/frontend/components/ui/**` (26 компонентов), `apps/frontend/assets/css/tokens/**`, dev-песочница `apps/frontend/pages/ui-kit.vue`.
- **Изменяется**: `apps/frontend/tailwind.config.ts`, `apps/frontend/assets/css/tailwind.css`, `apps/frontend/nuxt.config.ts`, `apps/frontend/layouts/default.vue`, все `apps/frontend/pages/**`, существующие `apps/frontend/components/scenario/**`.
- **Зависимости**: добавить `lucide-vue-next`.
- **Не затрагивается**: backend, API-контракты, composables/логика загрузки данных на страницах (меняется только разметка/стили), функциональные спеки в `openspec/specs/**`.
