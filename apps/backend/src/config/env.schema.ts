import { z } from "zod";
import {
  DEFAULT_RUN_ARTIFACT_MAX_MB,
  DEFAULT_SINGLE_UPLOAD_MAX_MB,
  DEFAULT_SPEC_FILE_MAX_MB,
  DEFAULT_SPEC_URL_FETCH_MAX_MB,
} from "./file-limits.constants";

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

  // Хост ("localhost") либо полный URL ("https://s3.twcstorage.ru") — схема
  // задаёт TLS и порт по умолчанию. S3_PORT нужен, только когда порт
  // нестандартный (локальный minio на 9000); см. parseS3Endpoint.
  S3_URL: z.string().default("localhost"),
  S3_PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_BUCKET: z.string().default("fuse"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),

  YANDEX_CLIENT_ID: z.string().default(""),
  YANDEX_CLIENT_SECRET: z.string().default(""),
  YANDEX_REDIRECT_URI: z
    .string()
    .default("http://localhost:3001/api/auth/callback"),
  APP_URL: z.string().default("http://localhost:5173"),

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

  LOG_COLLECTOR_URL: z.string().default(""),
  MONIUM_ENABLED: z.string().default(""),
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
