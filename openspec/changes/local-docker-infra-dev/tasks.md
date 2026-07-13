## 1. Инфраструктурный compose

- [x] 1.1 Переписать `docker-compose.dev.yml` как infra-only: удалить сервисы `backend`, `frontend`, `caddy`; оставить `mongo`, `localstack`, `minio`; обновить комментарий-шапку («инфраструктура для разработки на хосте; полный стек в докере — `docker-compose.yml`»)
- [x] 1.2 Исправить креды MinIO: `S3_ROOT_USER`/`S3_ROOT_PASSWORD` → `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` (значения по-прежнему из `S3_ACCESS_KEY`/`S3_SECRET_KEY` с дефолтом `minioadmin`)
- [x] 1.3 Добавить healthcheck'и: `mongo` (`mongosh --eval "db.adminCommand('ping')"`), `minio` (`mc ready local` либо HTTP-проба `/minio/health/live`), `localstack` (штатная проба готовности)
- [x] 1.4 Добавить одноразовый сервис `minio-init` на образе `minio/mc`: дождаться healthy-состояния `minio`, выполнить `mc alias set` + `mc mb --ignore-existing` для бакета из `S3_BUCKET`, завершиться с кодом 0
- [x] 1.5 Проверить, что порт Mongo на хосте — `27018`, SQS — `4566`, S3 — `9000`, консоль MinIO — `9001`, и что `docker/localstack/init-sqs.sh` по-прежнему смонтирован в `/etc/localstack/init/ready.d/`
- [x] 1.6 [обнаружено при прогоне] Починить CRLF в `docker/localstack/init-sqs.sh`: шебанг с `\r` ломал запуск (`/bin/bash\r` → «No such file or directory»), из-за чего SQS-очередь никогда не создавалась на Windows. Добавить `.gitattributes` (`*.sh text eol=lf`), чтобы checkout больше не портил скрипты
- [x] 1.7 [обнаружено при прогоне] Убрать `${...}`-интерполяцию из `docker-compose.dev.yml`: Compose автоматически читает корневой `.env` (но не `.env.local`), из-за чего локальный MinIO поднимался с БОЕВЫМИ ключами S3 и прод-именем бакета. Значения локальной инфры захардкожены и совпадают с `.env.local.example`

## 2. Профиль окружения

- [x] 2.1 В `apps/backend/src/app.module.ts` добавить `../../.env.local` первым элементом `envFilePath` (приоритет над `.env`)
- [x] 2.2 Создать `.env.local.example` с локальным профилем: `MONGODB_URL` на `localhost:27018`, `AWS_ENDPOINT_URL`/`AWS_SQS_QUEUE_URL` на `localhost:4566`, `S3_URL=localhost` + `S3_PORT=9000`, тестовые креды, `S3_BUCKET=fuse`
- [x] 2.3 Добавить `.env.local` в `.gitignore` и убедиться, что файл не попадает в `git status`
- [x] 2.4 Актуализировать `.env.example`: порт Mongo `27018` в профиле локальной инфры, комментарий про `.env.local` как способ переключения профилей

## 3. Скрипты запуска

- [x] 3.1 Починить `infra` в корневом `package.json`: `up -d --wait mongo localstack minio` + вторым шагом `run --rm minio-init`. Простой `up --wait` возвращает exit 1 — Compose считает штатный выход одноразового `minio-init` аварией
- [x] 3.2 Добавить `infra:down` (`down`, тома сохраняются), `infra:reset` (`down -v`, тома удаляются), `infra:logs` (`logs -f`) — все с `-f docker-compose.dev.yml`

## 4. Проверка сквозного сценария

- [x] 4.1 `pnpm infra` на чистом окружении: команда возвращает управление только после healthy всех сервисов; очередь `scenario-execution` и DLQ существуют; бакет `S3_BUCKET` создан
- [x] 4.2 Повторный `pnpm infra` на существующих томах проходит без ошибок, данные и ресурсы сохраняются (идемпотентность бутстрапа)
- [x] 4.3 `cp .env.local.example .env.local` + `pnpm dev`: бэкенд стартует, подключается к локальным Mongo/SQS/S3; проверить, что ни одного обращения к прод-Mongo, Yandex-очереди и внешнему S3 нет
- [x] 4.4 Запустить сценарий из локального UI: сообщение уходит в локальную очередь, обрабатывается локальным воркером, статус доходит до терминального (не виснет в «Выполняем сценарий…»)
  - Закрыто изменением `local-dev-seed-and-e2e`: сид даёт герметичный сценарий, а e2e-тест `scenario-run.spec.ts` прогоняет его из UI и падает, если статус не дошёл до терминального. Проверка стала репитабельной, а не ручной
- [x] 4.5 Проверить загрузку файла: объект появляется в бакете локального MinIO (консоль `http://localhost:9001`)
- [x] 4.6 Удалить `.env.local` и убедиться, что бэкенд снова использует удалённые сервисы, а `.env` при этом не изменялся
- [x] 4.7 `pnpm infra:reset` → `pnpm infra`: среда пересоздаётся с пустой БД, пустым бакетом и заново созданной очередью, без ручных шагов

## 5. Документация

- [x] 5.1 Раздел в `README.md`: поднять инфру (`pnpm infra`), включить локальный профиль (`cp .env.local.example .env.local`), запустить `pnpm dev`; таблица портов (27018 / 4566 / 9000 / 9001)
- [x] 5.2 Задокументировать, как понять, к чему подключён бэкенд (наличие `.env.local` + лог при старте), и как вернуться к удалённым сервисам
- [x] 5.3 Отметить BREAKING: `docker compose -f docker-compose.dev.yml up` больше не поднимает приложение — для полного стека в докере используется `docker compose up`
