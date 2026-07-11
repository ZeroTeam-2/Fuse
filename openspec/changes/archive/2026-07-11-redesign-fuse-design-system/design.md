# Design — Fuse Design System внедрение

## Контекст и источник

Дизайн-система лежит в `assets/Fuse Design System/`. Ключевые артефакты:
- `tokens/*.css` — источник истины по цвету/типографике/отступам/радиусам/теням.
- `components/**/*.jsx` + `*.prompt.md` — 26 React-компонентов с описанием props.
- `ui_kits/fuse-app/*.jsx` — эталонная сборка всех экранов продукта (маркетплейс → просмотр/запуск сценария → редактор → API → профиль).
- `readme.md`, `SKILL.md` — брендовые правила.

## Ключевое решение: порт JSX → Vue SFC

DS написан на React, проект — на Vue 3 / Nuxt 3. Оба стека используют **Tailwind**, поэтому:
- **Tailwind-классы переносятся дословно** — это и есть закодированное дизайн-решение (варианты, размеры, состояния).
- Портируется только «обвязка» компонента:
  - `function Comp({propA, children})` → `<script setup>` + `defineProps` + `defineEmits`.
  - `children` → `<slot />`; именованные слоты для сложных компонентов.
  - `iconLeft`/`iconRight` как ReactNode → слоты `#left` / `#right` (или проп `icon` там, где это имя иконки).
  - `onClick` → нативное событие / `emit('click')`.
  - `className`/`style` passthrough → `class`/`style` (Vue мёржит `class` автоматически на корне).
  - `...rest` passthrough → `v-bind="$attrs"` (inheritAttrs по умолчанию ок для однокорневых).
- Массивы вариантов (`VARIANTS`, `SIZES`, `TONES`) переносятся как обычные JS-объекты в `<script setup>`.

## Палитра и Tailwind

Токены DS = дефолтная палитра Tailwind (`rose` = crimson, `zinc`, `green`, `violet`) — значения совпадают до хекса (`rose-600 = #e11d48`). Значит компоненты используют стоковые классы `bg-rose-600`, `text-zinc-900` и т.п. без кастомной темы.

`tailwind.config.ts`:
- `fontFamily.sans` → `['Golos Text', …]`, `fontFamily.mono` → `['JetBrains Mono', …]`, `display` → Golos Text.
- Существующий `colors.brand` (= rose) сохраняем для обратной совместимости, но новые компоненты используют `rose-*` напрямую.
- Радиусы/тени из DS остаются доступны как CSS-переменные (см. ниже) для страниц; компоненты используют Tailwind-утилиты (`rounded-2xl`, `shadow-sm/lg`), как в исходных JSX.

## Токены как CSS-переменные

Копируем `tokens/{colors,typography,spacing,radii,shadows,base}.css` в `apps/frontend/assets/css/tokens/` и `@import`-им в начале `tailwind.css`. Это даёт:
- переменные `--rose-*`, `--zinc-*`, `--shadow-card`, `--radius-*`, `--space-*`, `--ring-brand` и т.д. для тонкой вёрстки страниц;
- брендовый `base.css` (сброс, `body` на `--surface-app`/zinc-50, responsive root font-size, keyframes `fuse-spin`/`fuse-fade-up`).
- `fonts.css` **не** импортируем — шрифты грузим через `nuxt.config.ts` head (Google Fonts CDN), чтобы не дублировать загрузку.

## Иконки

`Icon.jsx` в DS императивно дёргает `window.lucide` (CDN). Во Vue идиоматичнее `lucide-vue-next`:
- `Icon.vue` резолвит глиф по строковому имени (`<Icon name="search" />`) из экспортов пакета (kebab → PascalCase), пробрасывает `size`/`strokeWidth`/`color`. Так сохраняется API исходного компонента.

## Регистрация компонентов

Nuxt: `components/ui/` регистрируем c `pathPrefix: false`, чтобы имена совпадали с DS (`<Button>`, `<Card>`, `<ScenarioCard>`), а не `<UiButton>`.

## Верификация

Dev-песочница `pages/ui-kit.vue` воспроизводит `*.card.html`-специмены из DS: каждый компонент во всех вариантах/размерах/состояниях. Проверяем визуально до сборки страниц. Страница нужна только в dev.

## Порядок работ

1. **Фаза 0 — фундамент**: токены, tailwind.config, шрифты, layout.
2. **Фаза 1 — компоненты** (по зависимостям): core → forms → navigation → data → cards → feedback, с песочницей.
3. **Фаза 2 — страницы**: маркетплейс → сценарий (view/run/playground) → my/apps → my/scenarios (+редактор, модалки) → profile → login.

## Открытые вопросы / флаги

- Шрифты через CDN (по решению). Для прод-стабильности позже можно перейти на self-host.
- Lucide — заявленная в DS подстановка иконок; если появится «настоящий» icon-set, меняем реализацию `Icon`, API остаётся.
- Точные значения из скриншотов best-effort (см. readme DS) — расхождения правим по факту.
