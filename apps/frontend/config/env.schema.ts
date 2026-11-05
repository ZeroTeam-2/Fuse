import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * sha256 отозванных значений. Значения в репозиторий не возвращаются — в коде
 * только хэши, посчитанные до удаления файла окружения; источник — таблица в
 * `openspec/changes/harden-security-posture/tasks.md` (1.9).
 *
 * Фронтенду релевантно одно: до ротации `NUXT_SESSION_SECRET` и `JWT_SECRET`
 * были одним и тем же значением, то есть компрометация сессии Nuxt давала право
 * подписывать токены доступа бэкенда.
 */
const REVOKED_SECRET_HASHES: ReadonlySet<string> = new Set([
  "67b10701b534be9b9908f01f2dd1821237bb70189a69eb6199aaa57c4535acdd",
]);

/**
 * Минимум различных символов: `openssl rand -hex 48` даёт 16, порог в 5 отсекает
 * строки вида «aaaa…», не задевая случайные значения.
 */
const MIN_DISTINCT_CHARS = 5;

export const publicEnvSchema = z.object({
  apiBaseUrl: z.string().min(1, "NUXT_PUBLIC_API_BASE_URL is required"),
  yandexMetricaId: z.string().default(""),
  fileSingleUploadMaxMb: z.coerce.number().default(10),
  specFileMaxMb: z.coerce.number().default(15),
});

export const serverEnvSchema = z.object({
  // Плейсхолдер здесь проходит намеренно: сборка фронтенда идёт без секретов, а
  // отказ на сборочном значении, дожившем до рантайма, делает nitro-плагин.
  sessionSecret: z
    .string()
    .min(32, "NUXT_SESSION_SECRET must be at least 32 characters")
    .refine(
      (value) =>
        !REVOKED_SECRET_HASHES.has(
          createHash("sha256").update(value, "utf8").digest("hex"),
        ),
      "NUXT_SESSION_SECRET скомпрометирован и отозван (утёк в публичный репозиторий) — сгенерируйте новое значение: openssl rand -hex 48",
    )
    .refine(
      (value) => new Set(value).size >= MIN_DISTINCT_CHARS,
      "NUXT_SESSION_SECRET собран из слишком малого числа различных символов — сгенерируйте случайное: openssl rand -hex 48",
    ),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
