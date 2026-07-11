/**
 * Одноразовый бэкфилл: проставляет `baseUrl` приложениям, импортированным до
 * того, как это поле появилось. Правило вывода — то же, что при импорте
 * (`deriveBaseUrl`), поэтому расхождения между старыми и новыми документами нет.
 *
 * Запуск (из корня репозитория или из apps/backend):
 *   pnpm --filter @fuse/backend backfill:base-url
 *   pnpm --filter @fuse/backend backfill:base-url -- --dry-run
 *
 * Идемпотентен: документы с уже заполненным `baseUrl` пропускаются.
 */
// mongoose — CommonJS, под ESM берём его через default-импорт.
import mongoose from "mongoose";
import { resolve } from "node:path";
import { deriveBaseUrl } from "../src/apps/base-url.ts";

const dryRun = process.argv.includes("--dry-run");

// .env лежит в корне монорепозитория; ConfigModule здесь не поднимаем —
// скрипт запускается голым node, без Nest.
process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));

const mongoUrl = process.env.MONGODB_URL;
if (!mongoUrl) {
  console.error("MONGODB_URL is not set");
  process.exit(1);
}

interface AppDoc {
  _id: unknown;
  name?: string;
  openapiUrl?: string;
  baseUrl?: string;
  specSnapshot?: { servers?: { url?: string }[]; host?: string; basePath?: string };
}

await mongoose.connect(mongoUrl);

const apps = mongoose.connection.db!.collection<AppDoc>("apps");
const all = await apps.find({}).toArray();

let filled = 0;
let skipped = 0;
let failed = 0;

for (const app of all) {
  const label = `${String(app._id)} (${app.name ?? "unnamed"})`;

  if (app.baseUrl) {
    console.log(`skip   ${label}: baseUrl already set → ${app.baseUrl}`);
    skipped++;
    continue;
  }

  if (!app.openapiUrl) {
    console.warn(`FAIL   ${label}: no openapiUrl — cannot derive a base URL`);
    failed++;
    continue;
  }

  const baseUrl = deriveBaseUrl(app.specSnapshot, app.openapiUrl);
  if (!baseUrl) {
    console.warn(`FAIL   ${label}: could not derive from ${app.openapiUrl}`);
    failed++;
    continue;
  }

  const host = new URL(baseUrl).host;

  if (!dryRun) {
    await apps.updateOne({ _id: app._id }, { $set: { baseUrl, host } });
  }
  console.log(`${dryRun ? "would " : "fill  "} ${label}: → ${baseUrl}`);
  filled++;
}

console.log(
  `\n${dryRun ? "[dry-run] " : ""}done: ${filled} filled, ${skipped} skipped, ${failed} failed (of ${all.length})`,
);

await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
