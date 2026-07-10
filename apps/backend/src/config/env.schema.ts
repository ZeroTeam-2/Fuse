import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3001").transform(Number),

  MONGODB_URL: z.string().min(1, "MONGODB_URL is required"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  AWS_REGION: z.string().default("us-east-1"),
  AWS_SQS_QUEUE_URL: z.string().min(1, "AWS_SQS_QUEUE_URL is required"),
  AWS_ACCESS_KEY_ID: z.string().default("test"),
  AWS_SECRET_ACCESS_KEY: z.string().default("test"),
  AWS_ENDPOINT_URL: z.string().default(""),

  S3_URL: z.string().default("localhost"),
  S3_PORT: z.string().default("9000").transform(Number),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_BUCKET: z.string().default("fuse"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),

  YANDEX_CLIENT_ID: z.string().default(""),
  YANDEX_CLIENT_SECRET: z.string().default(""),
  YANDEX_REDIRECT_URI: z.string().default("http://localhost:3001/api/auth/callback"),
  APP_URL: z.string().default("http://localhost:3000"),

  FILE_SINGLE_UPLOAD_MAX_MB: z.string().default("10").transform(Number),

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
