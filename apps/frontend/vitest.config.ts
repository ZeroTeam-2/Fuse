import { defineConfig } from "vitest/config";

// Только юнит-тесты утилит: e2e/ — Playwright, его спеки vitest не собирает.
export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
  },
});
