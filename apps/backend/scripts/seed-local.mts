/**
 * Сид локальной среды: пользователь, демо-приложение на мок-API и два сценария.
 * После `pnpm infra:reset` база пустая — без сида в UI нечего открыть и нечего
 * запустить.
 *
 * Запуск (из корня репозитория):
 *   pnpm seed
 *
 * Идемпотентен: сущности ищутся по стабильным ключам и обновляются, а не
 * дублируются. Работает ТОЛЬКО против локальной БД (см. проверку ниже).
 */
// mongoose — CommonJS, под ESM берём его через default-импорт.
import mongoose from "mongoose";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { StepType } from "@fuse/shared";
import type { ApiStep, DelayStep, SchemaField } from "@fuse/shared";

const rootDir = resolve(import.meta.dirname, "../../..");

// Порядок как в ConfigModule бэкенда: .env.local перекрывает .env. Node не
// затирает уже установленные переменные, поэтому local грузим первым.
const localEnv = resolve(rootDir, ".env.local");
if (existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}
process.loadEnvFile(resolve(rootDir, ".env"));

const mongoUrl = process.env.MONGODB_URL;
if (!mongoUrl) {
  console.error("MONGODB_URL не задан");
  process.exit(1);
}

// Сид пишет и перезаписывает данные. Запуск с боевым .env (MONGODB_URL смотрит
// на прод) — ровно тот класс ошибок, ради которого заводилась локальная инфра.
const host = new URL(mongoUrl.replace("mongodb://", "http://")).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(
    `Отказ: MONGODB_URL указывает на «${host}», а не на локальную БД.\n` +
      "Сид работает только против локальной инфраструктуры.\n" +
      "Включите локальный профиль: cp .env.local.example .env.local",
  );
  process.exit(1);
}

const MOCK_API_URL = process.env.SEED_MOCK_API_URL ?? "http://localhost:8085";

export const SEED_USER_EMAIL = "seed@fuse.local";
const SEED_APP_NAME = "Mock API (seed)";
const SEED_ENDPOINT_ID = "seed-echo";
const DELAY_SCENARIO_TITLE = "Демо: задержка";
const API_SCENARIO_TITLE = "Демо: запрос к API";

const endpointInputs: SchemaField[] = [
  { key: "query", label: "Запрос", type: "string", loc: "body", required: true },
];
const endpointOutputs: SchemaField[] = [
  { key: "method", label: "HTTP-метод", type: "string" },
  { key: "url", label: "URL", type: "string" },
];

await mongoose.connect(mongoUrl);
const db = mongoose.connection.db;
if (!db) throw new Error("Не удалось получить подключение к БД");

const now = new Date();

// ─── Пользователь ────────────────────────────────────────────────────────────
await db.collection("users").updateOne(
  { email: SEED_USER_EMAIL },
  {
    $set: { firstName: "Seed", lastName: "User", updatedAt: now },
    $setOnInsert: { email: SEED_USER_EMAIL, yandexId: "seed-local-user", createdAt: now },
  },
  { upsert: true },
);
const user = await db.collection("users").findOne({ email: SEED_USER_EMAIL });
const ownerId = String(user!._id);

// ─── Приложение на мок-API ───────────────────────────────────────────────────
await db.collection("apps").updateOne(
  { ownerId, name: SEED_APP_NAME },
  {
    $set: {
      description: "Демо-приложение поверх локального мока (go-httpbin).",
      baseUrl: MOCK_API_URL,
      openapiUrl: `${MOCK_API_URL}/spec.json`,
      endpoints: [
        {
          id: SEED_ENDPOINT_ID,
          method: "POST",
          path: "/post",
          summary: "Эхо: возвращает то, что отправили",
          inputs: endpointInputs,
          outputs: endpointOutputs,
          outputIsArray: false,
          status: "active",
        },
      ],
      published: true,
      updatedAt: now,
    },
    $setOnInsert: { ownerId, name: SEED_APP_NAME, createdAt: now },
  },
  { upsert: true },
);
const app = await db.collection("apps").findOne({ ownerId, name: SEED_APP_NAME });
const appId = String(app!._id);

// ─── Сценарии ────────────────────────────────────────────────────────────────
// Герметичный: не ходит в сеть, поэтому запуск детерминированно доходит до
// completed — на нём держится e2e-проверка сквозного запуска.
const delayStep: DelayStep = {
  id: "step-delay",
  title: "Пауза 2 секунды",
  type: StepType.DELAY,
  seconds: 2,
};

const apiStep: ApiStep = {
  id: "step-api",
  title: "Эхо-запрос",
  type: StepType.API,
  appId,
  endpointId: SEED_ENDPOINT_ID,
  method: "POST",
  path: "/post",
  consts: { query: "7707083893" },
};

async function upsertScenario(title: string, description: string, steps: unknown[]) {
  await db!.collection("scenarios").updateOne(
    { ownerId, title },
    {
      // published: сценарий доступен карточкой — с неё его и запускают из UI.
      $set: { description, steps, category: "Прочее", published: true, updatedAt: now },
      $setOnInsert: { ownerId, title, runCount: 0, blocked: false, createdAt: now },
    },
    { upsert: true },
  );
  const doc = await db!.collection("scenarios").findOne({ ownerId, title });
  return String(doc!._id);
}

const delayScenarioId = await upsertScenario(
  DELAY_SCENARIO_TITLE,
  "Сценарий без внешних вызовов: проверяет сквозной запуск (очередь → воркер → статус).",
  [delayStep],
);
const apiScenarioId = await upsertScenario(
  API_SCENARIO_TITLE,
  "Сценарий с api-шагом к локальному мок-API.",
  [apiStep],
);

// Тестам нужны id сид-сущностей (e2e входит под этим пользователем и запускает
// этот сценарий). Файл в .gitignore — он локальный артефакт, как и сами данные.
await writeFile(
  resolve(rootDir, ".seed.json"),
  `${JSON.stringify(
    { userId: ownerId, email: SEED_USER_EMAIL, appId, delayScenarioId, apiScenarioId },
    null,
    2,
  )}\n`,
);

const counts = {
  users: await db.collection("users").countDocuments({ email: SEED_USER_EMAIL }),
  apps: await db.collection("apps").countDocuments({ ownerId }),
  scenarios: await db.collection("scenarios").countDocuments({ ownerId }),
};

console.log("Сид выполнен:");
console.log(`  пользователь: ${SEED_USER_EMAIL} (id ${ownerId})`);
console.log(`  приложение:   ${SEED_APP_NAME} → ${MOCK_API_URL}`);
console.log(`  сценарии:     «${DELAY_SCENARIO_TITLE}», «${API_SCENARIO_TITLE}»`);
console.log(`  всего: users=${counts.users} apps=${counts.apps} scenarios=${counts.scenarios}`);
console.log("  id сущностей записаны в .seed.json (нужны e2e-тестам)");

await mongoose.disconnect();
