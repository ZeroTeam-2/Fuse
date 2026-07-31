/**
 * Одноразовый бэкфилл: заводит окружение Prod приложениям, созданным до того,
 * как появились окружения. Base URL окружения берётся из существующего
 * `baseUrl` приложения — то же значение, что использовалось при исполнении.
 *
 * Запуск (из корня репозитория или из apps/backend):
 *   pnpm --filter @fuse/backend backfill:environments
 *   pnpm --filter @fuse/backend backfill:environments -- --dry-run
 *
 * Идемпотентен: приложения с непустым `environments` пропускаются.
 */
// mongoose — CommonJS, под ESM берём его через default-импорт.
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const dryRun = process.argv.includes("--dry-run");

const PROD_ENV_NAME = "Prod";
const BASE_URL_VAR_KEY = "baseUrl";

// .env лежит в корне монорепозитория; ConfigModule здесь не поднимаем —
// скрипт запускается голым node, без Nest.
process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));

const mongoUrl = process.env.MONGODB_URL;
if (!mongoUrl) {
  console.error("MONGODB_URL is not set");
  process.exit(1);
}

interface EnvironmentDoc {
  id: string;
  name: string;
  variables: { key: string; value: string }[];
}

interface AppDoc {
  _id: unknown;
  name?: string;
  baseUrl?: string;
  environments?: EnvironmentDoc[];
}

await mongoose.connect(mongoUrl);

const apps = mongoose.connection.db!.collection<AppDoc>("apps");
const all = await apps.find({}).toArray();

let filled = 0;
let skipped = 0;

for (const app of all) {
  const label = `${String(app._id)} (${app.name ?? "unnamed"})`;

  if ((app.environments?.length ?? 0) > 0) {
    console.log(`skip   ${label}: environments already set`);
    skipped++;
    continue;
  }

  const prod: EnvironmentDoc = {
    id: randomUUID(),
    name: PROD_ENV_NAME,
    variables: [{ key: BASE_URL_VAR_KEY, value: app.baseUrl ?? "" }],
  };

  if (!dryRun) {
    await apps.updateOne({ _id: app._id }, { $set: { environments: [prod] } });
  }
  console.log(
    `${dryRun ? "would " : "fill  "} ${label}: Prod → ${app.baseUrl ?? "(empty baseUrl)"}`,
  );
  filled++;
}

console.log(
  `\n${dryRun ? "[dry-run] " : ""}done: ${filled} filled, ${skipped} skipped (of ${all.length})`,
);

await mongoose.disconnect();
process.exit(0);
