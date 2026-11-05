import type { ThrottlerOptions } from "@nestjs/throttler";

/**
 * Окна ограничения частоты запросов.
 *
 * Все лимиты заданы в одном окне (минута) и считаются по адресу клиента —
 * `req.ips[0]` при включённом `trust proxy`. Без доверия к `X-Forwarded-For`
 * ключом станет адрес контейнера Caddy, один и тот же для всех: глобальный лимит
 * тогда складывает трафик всех пользователей в один счётчик и под нагрузкой
 * выключает сервис сам. Поэтому `trust proxy` (TRUST_PROXY_HOPS) — не деталь
 * настройки, а условие работоспособности этих лимитов.
 *
 * Переопределение на маршруте делается через `@Throttle({ default: … })` — имя
 * `default` совпадает с единственным объявленным ниже окном.
 */
const WINDOW_MS = 60_000;

/** Весь трафик: запас для обычной работы интерфейса, потолок для автоматики. */
export const THROTTLE_DEFAULT: ThrottlerOptions = { ttl: WINDOW_MS, limit: 60 };

/** `/auth/callback`, `/auth/refresh`, `/auth/logout` — обмен и отзыв сессии. */
export const THROTTLE_AUTH: ThrottlerOptions = { ttl: WINDOW_MS, limit: 10 };

/** `/auth/dev-login`: сверка пары логин-пароль, без лимита перебирается. */
export const THROTTLE_DEV_LOGIN: ThrottlerOptions = { ttl: WINDOW_MS, limit: 5 };

/** Публичные маршруты маркетплейса — единственные без аутентификации. */
export const THROTTLE_MARKETPLACE: ThrottlerOptions = { ttl: WINDOW_MS, limit: 30 };

/** Приём файлов: каждый запрос буферизует тело в память процесса. */
export const THROTTLE_UPLOADS: ThrottlerOptions = { ttl: WINDOW_MS, limit: 20 };

/**
 * Счётчики живут в памяти процесса — внешней инфраструктуры для них не нужно,
 * и пока API разворачивается одним инстансом этого достаточно.
 *
 * При горизонтальном масштабировании API (воркеры уже едут репликами) N
 * инстансов дают фактический лимит в N раз больше заявленного. Точка
 * переключения — `storage` в `ThrottlerModule.forRoot` в `app.module.ts`: туда
 * подставляется внешнее хранилище счётчиков. Выбор хранилища — открытый вопрос
 * Q2 в design.md, и решить его нужно до того, как API поедет репликами, а не
 * после.
 */
export const throttlers: ThrottlerOptions[] = [{ name: "default", ...THROTTLE_DEFAULT }];
