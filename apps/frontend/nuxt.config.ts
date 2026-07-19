import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { publicEnvSchema, serverEnvSchema } from "./config/env.schema";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const sharedSrc = resolve(rootDir, "../../packages/shared/src");
loadEnv({ path: resolve(rootDir, "../../.env") });
delete process.env.PORT;
delete process.env.NITRO_PORT;

const publicResult = publicEnvSchema.safeParse({
  apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "",
  yandexMetricaId: process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID ?? "",
  fileSingleUploadMaxMb: process.env.FILE_SINGLE_UPLOAD_MAX_MB ?? "10",
  specFileMaxMb: process.env.SPEC_FILE_MAX_MB ?? "15",
});
if (!publicResult.success) {
  const errors = publicResult.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`[env] Public env validation failed:\n${errors}`);
}

const serverResult = serverEnvSchema.safeParse({
  sessionSecret: process.env.NUXT_SESSION_SECRET ?? "",
});
if (!serverResult.success) {
  const errors = serverResult.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`[env] Server env validation failed:\n${errors}`);
}

export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },

  alias: {
    "@fuse/shared": resolve(sharedSrc, "index.ts"),
  },

  modules: ["@nuxtjs/tailwindcss", "@pinia/nuxt", "nuxt-tiptap-editor"],

  vite: {
    optimizeDeps: {
      // Tiptap подключается только в редакторе (RichTextEditor). Без этого Vite
      // обнаруживает его лишь при первом переходе туда, пересобирает зависимости
      // и перезагружает страницу прямо посреди навигации — переход падает, а
      // вызвавшая его форма получает ошибку на ровном месте.
      // Здесь только пакет, который импортирует само приложение: @tiptap/vue-3 и
      // starter-kit — зависимости nuxt-tiptap-editor и из фронтенда не резолвятся.
      include: ["@tiptap/extension-placeholder"],
    },
  },

  components: [
    // Design-system primitives registered without a path prefix so their names
    // match the source design system (<Button>, <Card>, <ScenarioCard>…).
    { path: "~/components/ui", pathPrefix: false },
    "~/components",
  ],

  css: ["~/assets/css/tailwind.css"],

  app: {
    head: {
      // Заголовок по умолчанию: без него вкладка браузера остаётся безымянной
      // (страницы могут переопределять его через useHead).
      title: "Fuse",
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossorigin: "",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap",
        },
      ],
    },
  },

  runtimeConfig: {
    sessionSecret: "",
    public: {
      apiBaseUrl: "",
      yandexMetricaId: "",
      // Дефолты; NUXT_PUBLIC_* переопределяет в рантайме. Держим синхронно с
      // бэкендом (FILE_SINGLE_UPLOAD_MAX_MB / SPEC_FILE_MAX_MB /
      // DEFAULT_UPLOAD_PART_SIZE_MB в file-limits.constants.ts).
      fileSingleUploadMaxMb: 10,
      specFileMaxMb: 15,
      uploadPartSizeMb: 5,
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
