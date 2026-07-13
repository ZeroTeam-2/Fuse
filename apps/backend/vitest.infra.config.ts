import { defineConfig } from "vitest/config";

// Отдельный набор: smoke-тесты локальной инфраструктуры (docker). Держим их вне
// обычного `pnpm test` — юнит-тесты не должны падать только от того, что докер
// не поднят. Суффикс `.infra-spec.ts` не попадает под дефолтный include vitest.
export default defineConfig({
  test: {
    include: ["test/**/*.infra-spec.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
