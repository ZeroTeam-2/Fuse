import { z } from "zod";

export const publicEnvSchema = z.object({
  apiBaseUrl: z.string().min(1, "NUXT_PUBLIC_API_BASE_URL is required"),
  yandexMetricaId: z.string().default(""),
  fileSingleUploadMaxMb: z.coerce.number().default(10),
});

export const serverEnvSchema = z.object({
  sessionSecret: z.string().min(32, "NUXT_SESSION_SECRET must be at least 32 characters"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
