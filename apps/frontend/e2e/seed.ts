/**
 * Доступ к сид-данным для e2e. Не тест — общий хелпер (Playwright запрещает
 * импортировать один тест-файл из другого).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Playwright транспилирует тесты в CJS, поэтому import.meta здесь недоступен.
// Тесты запускаются из apps/frontend (rootDir конфига), отсюда и считаем.
const rootDir = resolve(process.cwd(), "../..");

export const STORAGE_STATE = resolve(process.cwd(), "e2e/.auth/seed-user.json");

export interface SeedData {
  userId: string;
  email: string;
  appId: string;
  delayScenarioId: string;
  apiScenarioId: string;
}

export function readSeed(): SeedData {
  const seedPath = resolve(rootDir, ".seed.json");
  if (!existsSync(seedPath)) {
    throw new Error("Нет .seed.json — сначала засейте локальную БД: pnpm seed");
  }
  return JSON.parse(readFileSync(seedPath, "utf8")) as SeedData;
}

/** Грузим окружение так же, как бэкенд: .env.local перекрывает .env. */
export function loadEnv(): void {
  const localEnv = resolve(rootDir, ".env.local");
  if (existsSync(localEnv)) process.loadEnvFile(localEnv);
  process.loadEnvFile(resolve(rootDir, ".env"));
}
