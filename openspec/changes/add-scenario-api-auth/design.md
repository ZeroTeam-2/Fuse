## Context

В Design System (`Fuse Design System (1)/ui_kits/fuse-app/ScenarioEditor.jsx`) уже есть вкладка **«Авторизация»**: карточки per provider, SecretField, секция auth в панели шага с тогглом, shield на карточке шага. В продукте сейчас три вкладки редактора (Основная / Настройка шагов / Окружения); ключи к внешним API задаются только через маппинг Header или шаблон `Bearer {{access_token}}` из предыдущего шага.

Стек: NestJS + Mongoose, Nuxt/Vue, shared-типы в `packages/shared`. Окружения уже живут как `Scenario.environmentSelections` + `App.environments` — authConfig строится по тому же паттерну «поставщик из шагов → настройка на сценарии». OpenAPI-парсер (`openapi-parser.ts`) не читает `components.securitySchemes`. Marketplace отдаёт опубликованный сценарий без поля секретов (пока поля нет); GET владельца идёт через `ScenariosService.findById(id, ownerId)`.

## Goals / Non-Goals

**Goals:**
- Scenario-level ключи per `appId` с UI по дизайну (4-я вкладка).
- Парсинг Bearer / apiKey-in-header из OpenAPI → hint на App для дефолтов карточки.
- Инжект заголовка на исполнении; явный Header-маппинг шага побеждает; `authEnabled` + fail без ключа.
- Redaction `value` для всех, кроме владельца сценария; не логировать секреты в Run.
- Обратная совместимость с `Bearer {{access_token}}` и сценариями без authConfig.

**Non-Goals:**
- Encrypt at rest / KMS / secret manager.
- OAuth2 / openIdConnect / client credentials / refresh flows.
- Ключи на уровне App, Environment или user vault; «каждый раннер вводит свой ключ».
- apiKey in query/cookie; multiple security requirements (AND/OR) — берём один поддерживаемый scheme.
- Изменение модели публикации / ACL запуска (оставляем: любой аутентифицированный может запустить published сценарий с ключом владельца).

## Decisions

### 1. Модель данных: `authConfig` на Scenario
```ts
interface ScenarioAuthEntry {
  appId: string;
  /** Имя HTTP-заголовка: Authorization, X-Api-Key или custom */
  headerName: string;
  /**
   * Как формировать значение заголовка:
   * - `bearer` → `Bearer ${value}` (сырой токен в value)
   * - `raw` → value as-is (API Key и custom)
   */
  valueFormat: "bearer" | "raw";
  /** Plaintext секрет. В API non-owner / marketplace — отсутствует. */
  value?: string;
}

// Scenario.authConfig?: ScenarioAuthEntry[]
```
На api/periodic шаге: `authEnabled?: boolean` (явный флаг; при добавлении шага — `true`, если у App есть `auth` hint, иначе `false`).

- _Почему на сценарии, а не на App/Environment:_ решение продукта — создатель сценария делится use-case и своим доступом; разные сценарии одного App могут иметь разные ключи; окружения уже отвечают за baseUrl.
- _Почему массив, а не map:_ единообразие с `environmentSelections`; удобно чистить orphan-записи.
- _Альтернатива (user vault):_ отклонена на эту итерацию.

Список поставщиков на вкладке — как у «Окружений»: уникальные `appId` из api/periodic/file шагов. При save — drop `authConfig` для appId, которых больше нет в шагах.

### 2. Auth hint на App из OpenAPI
При импорте/реимпорте парсер читает `components.securitySchemes` и корневой / operation `security`:

| OpenAPI | → App.auth |
|---------|------------|
| `http` + `bearer` | `{ schemeLabel: "Bearer Token", headerName: "Authorization", valueFormat: "bearer", required: true }` |
| `apiKey` + `in: "header"` | `{ schemeLabel: "API Key", headerName: <name>, valueFormat: "raw", required: true }` |
| нет / oauth2 / openId / apiKey query|cookie | `auth` отсутствует или `undefined` → UI fallback |

Если у операции свой `security: []` (explicitly optional) — hint всё равно app-level (один на App); per-operation exception не моделируем в v1 — шаг просто выключает `authEnabled`.

При нескольких schemes — первый поддерживаемый из security requirement, иначе первый поддерживаемый из `securitySchemes`.

### 3. Redaction
Единый хелпер `redactScenarioAuth(scenario, viewerUserId)`:
- viewer === `ownerId` → полный `value`;
- иначе → entry без `value`, плюс `configured: boolean` (было ли непустое value), чтобы UI мог показать «ключ настроен» без раскрытия.

Применять везде, где сценарий уходит клиенту не как owner-edit: marketplace detail (если когда-либо начнём отдавать authConfig), любые публичные/чужие GET. Owner edit endpoints (`GET/PATCH /api/scenarios/:id` под Jwt + owner check) отдают полный value.

Update: owner шлёт полный entry с value. Пустой `value` при update **очищает** ключ (явное действие). Клиент не шлёт redacted payload на save — вкладка доступна только owner.

### 4. Приоритет на исполнении (worker)
Перед HTTP-вызовом api/periodic (и file, если ещё встречается):

1. Резолв mappings/consts → `located.header` как сейчас.
2. Если `step.authEnabled === true`:
   - найти `authConfig` по `step.appId`;
   - если нет entry или пустой value → **доменная ошибка** шага (run → failed), без fetch;
   - иначе вычислить header value (`Bearer ${v}` или raw);
   - если в `located.header` уже есть ключ с тем же именем (case-insensitive) — **не перезаписывать** (override маппингом);
   - иначе дописать заголовок.
3. Если `authEnabled` false/undefined — инжекта нет.

Шаблоны `{{access_token}}` в константах работают как раньше внутри шага 1 (резолв до inject).

Заголовки Authorization / секретные значения MUST NOT попадать в `stepResults`, тексты ошибок worker'а и structured logs (маскировать / omit).

### 5. UI
Четыре вкладки в `[id]/edit.vue`: Основная | Настройка шагов | Окружения | Авторизация. UI карточки — по Design System (`AuthProviderCard` / `SecretField` / empty state). StepConfig: секция «Аутентификация»; ScenarioStep: amber shield при `authEnabled`. Дефолты header/format с `App.auth`, с возможностью сменить на Authorization / X-Api-Key / custom.

### 6. Сосуществование со спекой `Bearer {{access_token}}`
Требование «заголовки авторизации по умолчанию получают `Bearer {{access_token}}`» **сохраняется** для header-параметров из схемы endpoint (как сейчас). Scenario auth — отдельный путь. Конфликт одного и того же header: маппинг побеждает (Decision 4).

## Risks / Trade-offs

- [Опубликованный сценарий жжёт квоту/ключ владельца при чужих запусках] → осознанный продукт; в UI вкладки — короткая подсказка «ключ используется при любом запуске этого сценария». Позже — отдельный режим «ключ раннера».
- [Plaintext в Mongo] → принятый компромисс v1; redaction в API и omit в логах; encrypt — follow-up.
- [Утечка через ошибку upstream, если провайдер echo'ит Authorization] → не контролируем чужой API; свои логи/Run — без секрета.
- [Реимпорт меняет scheme/header hint, а authConfig уже с другим headerName] → hint только для дефолтов новой карточки; сохранённый authConfig не авто-мигрируем; UI показывает сохранённое.
- [Orphan authConfig после удаления всех шагов поставщика] → cleanup при save steps / authConfig, зеркало environmentSelections.

## Migration Plan

1. Shared-типы → schema Scenario/App → DTO → `gen:types`.
2. Parser + import path; существующие App без `auth` валидны.
3. Worker inject + tests.
4. Redaction helper + применение на ответах.
5. Frontend вкладка + step UI.
6. Rollback: поле опционально; при откате кода старые документы с `authConfig` безвредны (игнорируются).

## Open Questions

_Нет блокирующих._ (Решение по fail-without-key: доменная ошибка — зафиксировано в Decisions / proposal.)
