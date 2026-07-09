import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { publicEnvSchema, serverEnvSchema } from './config/env.schema';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
loadEnv({ path: resolve(rootDir, '../../.env') });

const publicResult = publicEnvSchema.safeParse({
  apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? '',
  yandexMetricaId: process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID ?? '',
  fileSingleUploadMaxMb: process.env.FILE_SINGLE_UPLOAD_MAX_MB ?? '10',
});
if (!publicResult.success) {
  const errors = publicResult.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`[env] Public env validation failed:\n${errors}`);
}

const serverResult = serverEnvSchema.safeParse({
  sessionSecret: process.env.NUXT_SESSION_SECRET ?? '',
});
if (!serverResult.success) {
  const errors = serverResult.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`[env] Server env validation failed:\n${errors}`);
}

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  runtimeConfig: {
    sessionSecret: '',
    public: {
      apiBaseUrl: '',
      yandexMetricaId: '',
      fileSingleUploadMaxMb: 10,
    },
  },

  typescript: {
    strict: true,
    typeCheck: true,
  },

  imports: {
    autoImport: true,
  },
});
