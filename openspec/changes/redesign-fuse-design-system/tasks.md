## 1. Фаза 0 — фундамент

- [x] 1.1 Скопировать `tokens/{colors,typography,spacing,radii,shadows,base}.css` в `apps/frontend/assets/css/tokens/`
- [x] 1.2 `@import` токенов в начале `apps/frontend/assets/css/tailwind.css`
- [x] 1.3 Обновить `tailwind.config.ts`: `fontFamily.sans` → Golos Text, `mono` → JetBrains Mono, `display` → Golos Text (сохранить `colors.brand`)
- [x] 1.4 Обновить `nuxt.config.ts`: заменить Google Fonts link на `Golos Text` (400–900) + `JetBrains Mono`
- [x] 1.5 Настроить регистрацию компонентов `~/components/ui` c `pathPrefix: false`
- [x] 1.6 Установить `lucide-vue-next`
- [x] 1.7 Переработать `layouts/default.vue` (zinc-50 фон, TopNav-паттерн, BrandMark, Avatar)

## 2. Фаза 1 — core компоненты (`components/ui/`)

- [x] 2.1 `Icon.vue` (обёртка над `lucide-vue-next`, API `<Icon name>`)
- [x] 2.2 `Button.vue` (variants: primary/dark/secondary/ghost/tint/danger; sizes sm/md/lg; слоты left/right)
- [x] 2.3 `Card.vue` (interactive, padding, as)
- [x] 2.4 `Badge.vue` (tones success/brand/neutral/info; dot; sizes)
- [x] 2.5 `Avatar.vue` (initials/gradient/img, size)
- [x] 2.6 `BrandMark.vue` (mark + wordmark, size)
- [x] 2.7 `IconButton.vue` (floating/ghost/subtle/outline)
- [x] 2.8 `PublishButton.vue` (dashed → green с конфетти)
- [x] 2.9 Dev-песочница `pages/ui-kit.vue` — специмены core; визуальная проверка

## 3. Фаза 1 — forms

- [x] 3.1 `Input.vue`
- [x] 3.2 `Select.vue`
- [x] 3.3 `SearchInput.vue`
- [x] 3.4 Добавить формы в песочницу

## 4. Фаза 1 — navigation

- [x] 4.1 `TopNav.vue`
- [x] 4.2 `Tabs.vue`
- [x] 4.3 `SegmentedControl.vue`
- [x] 4.4 `Pagination.vue`
- [x] 4.5 `CategoryNav.vue`
- [x] 4.6 Добавить навигацию в песочницу

## 5. Фаза 1 — data display

- [x] 5.1 `ProviderIcon.vue`
- [x] 5.2 `MethodBadge.vue`
- [x] 5.3 `StatCard.vue`
- [x] 5.4 `EndpointRow.vue`
- [x] 5.5 `CodeBlock.vue`
- [x] 5.6 `KeyValueGrid.vue`
- [x] 5.7 `StepProgress.vue`
- [x] 5.8 `ScenarioStep.vue`
- [x] 5.9 Добавить data в песочницу

## 6. Фаза 1 — cards + feedback

- [x] 6.1 `ScenarioCard.vue`
- [x] 6.2 `AppRow.vue`
- [x] 6.3 `Modal.vue`
- [x] 6.4 Добавить cards/modal в песочницу

## 7. Фаза 2 — сборка страниц

- [x] 7.1 Маркетплейс (`pages/index.vue`) — CategoryNav + ScenarioCard grid + SearchInput + SegmentedControl + Pagination
- [x] 7.2 Просмотр сценария (`pages/cards/[id]/index.vue`) — Tabs, StatCard, EndpointRow
- [x] 7.3 Запуск сценария (`pages/cards/[id]/run.vue`) — StepProgress, Input/Select, CodeBlock
- [x] 7.4 Плейграунд (`pages/cards/[id]/playground.vue`) — CodeBlock, результаты
- [x] 7.5 Мои API (`pages/my/apps/index.vue`, `[id]/index.vue`, `new.vue`, `[id]/update.vue`) — AppRow, ProviderIcon, EndpointRow
- [ ] 7.6 Мои сценарии (`pages/my/scenarios/index.vue`, `new.vue`) — ScenarioCard, PublishButton
- [ ] 7.7 Редактор сценария (`pages/my/scenarios/[id]/edit.vue`) — ScenarioStep, Modal (add-step / new-page), StepConfig/StepPicker/PageEditor
- [ ] 7.8 Профиль (`pages/profile/index.vue`) — Avatar, KeyValueGrid, Tabs
- [ ] 7.9 Логин (`pages/login/index.vue`) — Input, Button, BrandMark
- [ ] 7.10 Убрать устаревшие индиго scoped-стили и самописный `avatar-placeholder`/`logo` из layout и страниц

## 8. Финал

- [ ] 8.1 `pnpm --filter @fuse/frontend typecheck`
- [ ] 8.2 Визуальный прогон всех экранов против `ui_kits/fuse-app`
- [ ] 8.3 Удалить/загейтить dev-песочницу `pages/ui-kit.vue`
