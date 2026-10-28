## 1. Конфигурация Garage

- [x] 1.1 Создать `docker/garage/garage.toml` с `metadata_dir`, `data_dir`, `db_engine = "sqlite"`, `replication_factor = 1`, фиксированным `rpc_secret` и блоком `[s3_api]` с `s3_region = "us-east-1"` и `api_bind_addr = "[::]:3900"`; проверка — контейнер с примонтированным конфигом стартует и пишет `S3 API server listening on http://[::]:3900`
- [x] 1.2 Добавить блок `[admin]` с `api_bind_addr = "[::]:3903"` и `admin_token`; проверка — `/garage status` внутри контейнера показывает ноду в `HEALTHY NODES`

## 2. Ротация секрета S3 (решение 8)

- [x] 2.1 Заменить `S3_SECRET_KEY=minioadmin` на `fuse-local-dev-secret` в `.env.local.example` и `.env.example`, обновив попутно комментарии с упоминанием MinIO; проверка — новое значение в обоих файлах
- [x] 2.2 Обновить литералы-дефолты в `apps/backend/src/config/env.schema.ts`, `apps/backend/src/minio/minio.service.ts` и `apps/backend/test/infra-smoke.infra-spec.ts`; проверка — старый секрет в `apps/backend/src` и `apps/backend/test` не встречается (идентификатор ключа `minioadmin` сохранён намеренно)
- [x] 2.3 Убедиться, что `pnpm typecheck` на бэкенде проходит после правки дефолтов; проверка — `pnpm --filter @fuse/backend typecheck` завершился с кодом 0

## 3. docker-compose.dev.yml

- [x] 3.1 Заменить сервис `minio` на `garage` (`image: dxflrs/garage:v2.5.0`, `container_name: fuse-garage`, команда `/garage server --single-node --default-bucket`, монтирование `./docker/garage/garage.toml:/etc/garage.toml:ro`, литеральные `GARAGE_DEFAULT_*` без `${...}`); проверка — `docker compose config` проходит, контейнер поднимается
- [x] 3.2 Опубликовать порт `9000:3900` и убрать публикацию `9001`; проверка — `http://localhost:9000` отвечает HTTP 403 на неподписанный запрос (S3 жив), TCP-подключение на 9001 не устанавливается
- [x] 3.3 Прописать healthcheck в exec-форме на бинаре `garage` (шелла в образе нет, `CMD-SHELL` неприменим); проверка — `docker inspect fuse-garage` показывает `healthy`, `pnpm infra` с `--wait` вернулся с кодом 0
- [x] 3.4 Заменить том `fuse-minio-data` на `fuse-garage-meta` и `fuse-garage-data`; проверка — `docker volume ls` показывает оба новых тома, `fuse_fuse-mongo-data` сохранён нетронутым
- [x] 3.5 Удалить сервис `minio-init` и файл `docker/minio/init-bucket.sh`; проверка — каталог `docker/minio/` отсутствует, в `docker-compose.dev.yml` упоминаний MinIO не осталось, кроме намеренно сохранённого идентификатора ключа `minioadmin`
- [x] 3.6 Обновить шапочный комментарий compose-файла и упростить скрипт `infra` в корневом `package.json`, убрав второй шаг `run --rm minio-init`; проверка — `pnpm infra` состоит из одной команды `docker compose up -d --wait`

## 4. Документация

- [x] 4.1 Обновить в `README.md` таблицу портов и схему архитектуры: убрать строку про консоль MinIO на 9001, назвать хранилище Garage; проверка — в README не осталось MinIO как локального сервера и ссылки на :9001
- [x] 4.2 Обновить таблицу переменных окружения под новый секрет и добавить раздел «Переход с MinIO на Garage» с ручным шагом правки `S3_SECRET_KEY` в `.env.local`; проверка — значения в README совпадают с `.env.local.example`
- [x] 4.3 Описать удаление осиротевшего тома `fuse-minio-data` и способ инспектировать бакет без консоли; проверка — `docker exec fuse-garage /garage bucket info fuse` отрабатывает и показывает алиас, размер и права ключа

## 5. Приёмка

- [x] 5.1 Прогнать полный холодный старт: удалить тома Garage и сам образ `dxflrs/garage:v2.5.0`, затем `pnpm infra`; проверка — образ скачался анонимно без `docker login`, все четыре контейнера `healthy`, команда вернула код 0
- [x] 5.2 Прогнать `pnpm test:infra`; проверка — 5/5 тестов зелёные, включая «бакет существует» и «round-trip: объект загружается и скачивается из S3»
- [ ] 5.3 Проверить presigned GET и multipart на реальном пути приложения: `pnpm seed`, загрузка файла через UI и открытие ссылки на артефакт. Требует поднятых dev-серверов — остаётся за разработчиком. Сами операции уже подтверждены headless-прогоном клиента `minio` против Garage (см. Risks в design.md): `presignedGetObject` → HTTP 200, multipart 2×6 МиБ → объект ожидаемого размера, `abortMultipartUpload` → ok
- [x] 5.4 Проверить, что сброс пересоздаёт пустой бакет без ручных шагов; проверка — после удаления томов Garage и `pnpm infra` бакет `fuse` существует с `Objects: 0`, `pnpm test:infra` снова зелёный. Полный `pnpm infra:reset` не прогонялся: он сносит `fuse_fuse-mongo-data` с локальными данными разработчика, а эта часть `down -v` данным изменением не затрагивается
