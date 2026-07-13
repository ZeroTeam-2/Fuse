import { defineConfig, devices } from "@playwright/test";

/**
 * E2E прогоняются против уже запущенного `pnpm dev` (фронт 5173, бэкенд 3001) и
 * поднятой локальной инфраструктуры с сид-данными (`pnpm infra && pnpm seed`).
 * Отдельный webServer здесь не поднимаем: сценарии исполняет бэкенд-воркер, а
 * ему нужны docker-сервисы — дешевле и честнее прогонять по реальной локальной
 * среде, чем поднимать половину стека внутри тестов.
 */
const STORAGE_STATE = "./e2e/.auth/seed-user.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      // Неавторизованные страницы: логин-модалка, главная.
      name: "public",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Всё остальное — под сид-пользователем.
      name: "authenticated",
      testIgnore: /smoke\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],
});
