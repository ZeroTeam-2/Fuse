import { z } from "zod";
import {
  DEFAULT_REQUEST_BODY_MAX_MB,
  DEFAULT_RUN_ARTIFACT_MAX_MB,
  DEFAULT_SINGLE_UPLOAD_MAX_MB,
  DEFAULT_SPEC_FILE_MAX_MB,
  DEFAULT_SPEC_URL_FETCH_MAX_MB,
} from "./file-limits.constants";
import { findExternalHosts } from "./external-config";
import {
  hasDegenerateAlphabet,
  isPlaceholderSecret,
  isRevokedSecret,
} from "./secret-policy";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3001").transform(Number),

  MONGODB_URL: z.string().min(1, "MONGODB_URL is required"),

  // Хосты в обход SSRF-блок-листа (localhost/приватные IP), через запятую.
  // ДОЛЖЕН быть в схеме: @nestjs/config кладёт в process.env только прошедшие
  // валидацию ключи, а SsrfGuard читает его из process.env. В проде — пусто.
  SSRF_ALLOWED_HOSTS: z.string().default(""),

  AWS_REGION: z.string().default("us-east-1"),
  AWS_SQS_QUEUE_URL: z.string().min(1, "AWS_SQS_QUEUE_URL is required"),
  AWS_ACCESS_KEY_ID: z.string().default("test"),
  AWS_SECRET_ACCESS_KEY: z.string().default("test"),
  AWS_ENDPOINT_URL: z.string().default(""),

  // Сколько запусков один воркер-процесс держит одновременно (batchSize
  // sqs-consumer). Верхняя граница 10 — лимит одного ReceiveMessage у SQS;
  // потребность в большем закрывается числом воркеров, а не толстым процессом.
  WORKER_CONCURRENCY: z
    .string()
    .default("5")
    .transform(Number)
    .pipe(z.number().int().min(1).max(10)),

  // Хост ("localhost") либо полный URL ("https://s3.twcstorage.ru") — схема
  // задаёт TLS и порт по умолчанию. S3_PORT нужен, только когда порт
  // нестандартный (локальный minio на 9000); см. parseS3Endpoint.
  S3_URL: z.string().default("localhost"),
  S3_PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("fuse-local-dev-secret"),
  S3_BUCKET: z.string().default("fuse"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),

  // Секрет сессии Nuxt. Бэкенду он не нужен для работы и в docker-compose в
  // backend не пробрасывается — здесь он объявлен только чтобы сверить, что это
  // НЕ то же значение, что JWT_SECRET (до ротации было одно на две роли, то есть
  // компрометация сессии фронтенда давала право подписывать токены доступа).
  // Непустоту этой переменной требует схема фронтенда, где она и живёт.
  NUXT_SESSION_SECRET: z.string().default(""),

  // Сколько прокси-хопов перед приложением считать доверенными при разборе
  // X-Forwarded-For — от этого зависит ключ ограничения частоты запросов.
  //
  // Дефолт 0 (не доверять заголовку) выбран под `pnpm dev`, где перед бэкендом
  // никого нет: доверие к X-Forwarded-For без прокси означает, что клиент сам
  // назначает себе ключ лимита и обходит его подменой заголовка. Схему
  // развёртывания объявляет тот, кто её знает: docker-compose.yml ставит 1
  // (один Caddy), CDN или балансировщик провайдера перед ним — больше.
  TRUST_PROXY_HOPS: z
    .string()
    .default("0")
    .transform(Number)
    .pipe(z.number().int().min(0).max(10)),

  YANDEX_CLIENT_ID: z.string().default(""),
  YANDEX_CLIENT_SECRET: z.string().default(""),
  YANDEX_REDIRECT_URI: z
    .string()
    .default("http://localhost:3001/api/auth/callback"),
  APP_URL: z.string().default("http://localhost:5173"),

  // Локальный вход без OAuth: пара задаётся только на машине разработчика
  // (.env.local). Пустой DEV_LOGIN_PASSWORD означает, что маршрута нет —
  // AuthController отвечает на него 404. В проде непустой пароль запрещён,
  // см. superRefine ниже.
  DEV_LOGIN_EMAIL: z.string().default(""),
  DEV_LOGIN_PASSWORD: z.string().default(""),

  // Лимиты размера файлов. Дефолты — из file-limits.constants.ts (единый
  // источник правды); значения в МБ, производные байты считаются в потребителях.
  FILE_SINGLE_UPLOAD_MAX_MB: z
    .string()
    .default(String(DEFAULT_SINGLE_UPLOAD_MAX_MB))
    .transform(Number),
  SPEC_FILE_MAX_MB: z
    .string()
    .default(String(DEFAULT_SPEC_FILE_MAX_MB))
    .transform(Number),
  SPEC_URL_FETCH_MAX_MB: z
    .string()
    .default(String(DEFAULT_SPEC_URL_FETCH_MAX_MB))
    .transform(Number),
  RUN_ARTIFACT_MAX_MB: z
    .string()
    .default(String(DEFAULT_RUN_ARTIFACT_MAX_MB))
    .transform(Number),
  REQUEST_BODY_MAX_MB: z
    .string()
    .default(String(DEFAULT_REQUEST_BODY_MAX_MB))
    .transform(Number),

  LOG_COLLECTOR_URL: z.string().default(""),
  MONIUM_ENABLED: z.string().default(""),
}).superRefine((env, ctx) => {
  const addIssue = (path: string, message: string) => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  };

  // ─── Проверки, не зависящие от режима ──────────────────────────────────────

  // Отозванные значения отбиваются всегда, а не только в строгом режиме:
  // скомпрометированный секрет скомпрометирован и на машине разработчика, а
  // работающий с ним локальный профиль маскирует то, что ротация не доехала.
  for (const [name, value] of Object.entries({
    MONGODB_URL: env.MONGODB_URL,
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    S3_ACCESS_KEY: env.S3_ACCESS_KEY,
    S3_SECRET_KEY: env.S3_SECRET_KEY,
    JWT_SECRET: env.JWT_SECRET,
    NUXT_SESSION_SECRET: env.NUXT_SESSION_SECRET,
    YANDEX_CLIENT_SECRET: env.YANDEX_CLIENT_SECRET,
  })) {
    if (isRevokedSecret(value)) {
      addIssue(
        name,
        "значение скомпрометировано и отозвано (утекло в публичный репозиторий) — требуется ротация, сгенерируйте новое",
      );
    }
  }

  // Длину JWT_SECRET проверяет сама схема; здесь — качество алфавита: строка из
  // одного-двух повторяющихся символов проходит по длине, но подбирается.
  if (hasDegenerateAlphabet(env.JWT_SECRET)) {
    addIssue(
      "JWT_SECRET",
      "значение собрано из слишком малого числа различных символов — сгенерируйте случайное: openssl rand -hex 48",
    );
  }

  // Одно значение на подпись токенов и на сессию Nuxt означает, что компрометация
  // любой из двух ролей даёт и вторую. Ровно так и было до ротации.
  if (env.NUXT_SESSION_SECRET !== "" && env.JWT_SECRET === env.NUXT_SESSION_SECRET) {
    addIssue(
      "NUXT_SESSION_SECRET",
      "совпадает с JWT_SECRET — задайте два разных значения (openssl rand -hex 48 на каждое)",
    );
  }

  // По этому адресу уходят записи логов, включая адреса пользователей.
  if (env.LOG_COLLECTOR_URL !== "" && !env.LOG_COLLECTOR_URL.startsWith("https://")) {
    addIssue(
      "LOG_COLLECTOR_URL",
      "приёмник логов требует https:// — по http записи с данными пользователей уходят в открытом виде",
    );
  }

  // ─── Строгий режим ─────────────────────────────────────────────────────────

  // Включается по тому, НА ЧТО смотрит конфигурация, а не по NODE_ENV. Утёкший
  // профиль этого проекта был NODE_ENV=development при внешнем Mongo, очереди в
  // Yandex Cloud и хранилище в Timeweb — проверка, обусловленная production, в нём
  // не сработала бы ни одна.
  const externalHosts = findExternalHosts(env);
  const strict = env.NODE_ENV === "production" || externalHosts.length > 0;
  if (!strict) return;

  const reason = externalHosts.length > 0
    ? `конфигурация указывает на внешние адреса (${
      externalHosts.map((hit) => `${hit.variable}=${hit.host}`).join(", ")
    })`
    : "NODE_ENV=production";

  // Дефолты LocalStack и Garage остаются валидными в локальном профиле — иначе
  // встанет pnpm infra + pnpm dev у всех, включая CI. В строгом режиме они не
  // секреты, а публично известные значения.
  const requiredSecrets: Record<string, string> = {
    JWT_SECRET: env.JWT_SECRET,
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    S3_ACCESS_KEY: env.S3_ACCESS_KEY,
    S3_SECRET_KEY: env.S3_SECRET_KEY,
    YANDEX_CLIENT_ID: env.YANDEX_CLIENT_ID,
    YANDEX_CLIENT_SECRET: env.YANDEX_CLIENT_SECRET,
  };

  for (const [name, value] of Object.entries(requiredSecrets)) {
    if (isPlaceholderSecret(value)) {
      addIssue(
        name,
        `строгий режим (${reason}): значение пусто либо является плейсхолдером из образца окружения — задайте настоящее`,
      );
    }
  }

  // Непустой NUXT_SESSION_SECRET бэкенд проверяет на плейсхолдер, но не требует:
  // в docker-compose эта переменная уходит только во frontend.
  if (env.NUXT_SESSION_SECRET !== "" && isPlaceholderSecret(env.NUXT_SESSION_SECRET)) {
    addIssue(
      "NUXT_SESSION_SECRET",
      `строгий режим (${reason}): значение является плейсхолдером из образца окружения — задайте настоящее`,
    );
  }

  // Список обходит и блок-лист хостов, и шаг резолва DNS целиком: одна переменная
  // выключает всю защиту от SSRF, и в образце окружения она заполнена.
  if (env.SSRF_ALLOWED_HOSTS !== "") {
    addIssue(
      "SSRF_ALLOWED_HOSTS",
      `строгий режим (${reason}): список исключений SSRF допустим только в локальном профиле — очистите переменную`,
    );
  }

  // Вход по паролю не поднимается вместе с внешней базой. Раньше проверка была
  // привязана к NODE_ENV=production, то есть к профилю, которого у проекта нет.
  if (env.DEV_LOGIN_PASSWORD !== "") {
    addIssue(
      "DEV_LOGIN_PASSWORD",
      `строгий режим (${reason}): локальный вход по паролю запрещён — очистите DEV_LOGIN_PASSWORD`,
    );
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${formatted}`);
  }
  return result.data;
}
