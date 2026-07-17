import "dotenv/config";
import { connect, disconnect } from "mongoose";
import { randomUUID } from "node:crypto";

const MONGODB_URL = process.env.MONGODB_URL ?? "mongodb://localhost:27017/fuse";

interface SeedApp {
  _id: string;
  ownerId: string;
  name: string;
  description: string;
  openapiUrl: string;
  host: string;
  apiVersion: string;
  endpoints: unknown[];
  published: boolean;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface SeedScenario {
  _id: string;
  ownerId: string;
  title: string;
  tagline: string;
  description: string;
  coverUrl?: string;
  category: string;
  subcategory: string;
  steps: unknown[];
  published: boolean;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const DEMO_USER_ID = "seed-user-000000000000";

const apps: SeedApp[] = [
  {
    _id: randomUUID(),
    ownerId: DEMO_USER_ID,
    name: "DataHub",
    description:
      "Платформа обогащения данных: проверка контрагентов, очистка и нормализация адресов.",
    openapiUrl: "https://api.datahub.example.com/openapi.json",
    host: "api.datahub.example.com",
    apiVersion: "1.0",
    endpoints: [
      {
        id: "dh-1",
        method: "POST",
        path: "/v1/enrich",
        summary: "Обогащение данных контрагента",
      },
      {
        id: "dh-2",
        method: "GET",
        path: "/v1/verify/{inn}",
        summary: "Проверка ИНН",
      },
    ],
    published: true,
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: randomUUID(),
    ownerId: DEMO_USER_ID,
    name: "VisionText",
    description:
      "OCR и распознавание текста на изображениях с поддержкой русского и английского языков.",
    openapiUrl: "https://api.visiontext.example.com/openapi.json",
    host: "api.visiontext.example.com",
    apiVersion: "2.1",
    endpoints: [
      {
        id: "vt-1",
        method: "POST",
        path: "/v2/ocr",
        summary: "Распознать текст на изображении",
      },
      {
        id: "vt-2",
        method: "POST",
        path: "/v2/extract-tables",
        summary: "Извлечь таблицы из документа",
      },
    ],
    published: true,
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: randomUUID(),
    ownerId: DEMO_USER_ID,
    name: "SpeechLab",
    description:
      "Расшифровка речи в текст (ASR) и синтез речи (TTS) с поддержкой 40+ языков.",
    openapiUrl: "https://api.speechlab.example.com/openapi.json",
    host: "api.speechlab.example.com",
    apiVersion: "3.0",
    endpoints: [
      {
        id: "sl-1",
        method: "POST",
        path: "/v3/transcribe",
        summary: "Транскрибация аудио",
      },
      {
        id: "sl-2",
        method: "POST",
        path: "/v3/synthesize",
        summary: "Синтез речи из текста",
      },
    ],
    published: true,
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: randomUUID(),
    ownerId: DEMO_USER_ID,
    name: "GeoPin",
    description:
      "Геокодирование, обратное геокодирование и маршрутизация для России и СНГ.",
    openapiUrl: "https://api.geopin.example.com/openapi.json",
    host: "api.geopin.example.com",
    apiVersion: "1.4",
    endpoints: [
      {
        id: "gp-1",
        method: "GET",
        path: "/v1/geocode",
        summary: "Геокодирование адреса",
      },
      {
        id: "gp-2",
        method: "GET",
        path: "/v1/route",
        summary: "Построение маршрута",
      },
    ],
    published: true,
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function makeScenario(opts: {
  title: string;
  tagline: string;
  description: string;
  category: string;
  subcategory: string;
  appId: string;
  endpointId: string;
  runCount: number;
}): SeedScenario {
  return {
    _id: randomUUID(),
    ownerId: DEMO_USER_ID,
    title: opts.title,
    tagline: opts.tagline,
    description: opts.description,
    category: opts.category,
    subcategory: opts.subcategory,
    steps: [
      {
        id: randomUUID(),
        title: "Загрузка файла",
        type: "file",
        appId: opts.appId,
        fileMode: "single",
        page: {
          type: "file",
          title: "Загрузите данные",
          accept: "*/*",
          maxMb: 15,
          buttonText: "Продолжить",
        },
      },
      {
        id: randomUUID(),
        title: "Вызов API",
        type: "api",
        appId: opts.appId,
        endpointId: opts.endpointId,
        method: "POST",
        path: "https://api.example.com/v1/process",
      },
    ],
    published: true,
    runCount: opts.runCount,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const scenarios: SeedScenario[] = [
  makeScenario({
    title: "Обогащение базы клиентов",
    tagline:
      "Дополните контакты компаний реквизитами, статусами и риск-факторами",
    description:
      "Загрузите CSV со списком ИНН — получите обогащённый файл с реквизитами, статусами регистрации и риск-факторами.",
    category: "Данные",
    subcategory: "Обогащение данных",
    appId: apps[0]._id,
    endpointId: "dh-1",
    runCount: 342,
  }),
  makeScenario({
    title: "Проверка контрагентов на благонадёжность",
    tagline: "Массовая проверка контрагентов по ИНН",
    description:
      "Пакетная проверка контрагентов: ликвидность, долги, лицензии, связи.",
    category: "Данные",
    subcategory: "Проверка и комплаенс",
    appId: apps[0]._id,
    endpointId: "dh-2",
    runCount: 198,
  }),
  makeScenario({
    title: "Распознавание текста со сканов",
    tagline: "Извлеките текст и таблицы из PDF и фотографий",
    description:
      "OCR-обработка сканированных документов с извлечением структурированных данных и таблиц.",
    category: "Документы",
    subcategory: "Распознавание",
    appId: apps[1]._id,
    endpointId: "vt-1",
    runCount: 521,
  }),
  makeScenario({
    title: "Извлечение таблиц из PDF",
    tagline: "Превратите PDF-отчёты в Excel-таблицы",
    description:
      "Автоматическое извлечение табличных данных из PDF-документов с сохранением структуры.",
    category: "Документы",
    subcategory: "Извлечение и структура",
    appId: apps[1]._id,
    endpointId: "vt-2",
    runCount: 287,
  }),
  makeScenario({
    title: "Транскрибация аудиозаписей",
    tagline: "Превратите голосовые сообщения и интервью в текст",
    description:
      "Расшифровка аудиозаписей любой длительности с разделением по спикерам и тайм-кодами.",
    category: "Аудио",
    subcategory: "Расшифровка речи",
    appId: apps[2]._id,
    endpointId: "sl-1",
    runCount: 415,
  }),
  makeScenario({
    title: "Синтез речи для подкастов",
    tagline: "Создайте профессиональную озвучку текста",
    description:
      "Генерация естественной речи из текста с выбором голоса и интонации.",
    category: "Аудио",
    subcategory: "Анализ и синтез",
    appId: apps[2]._id,
    endpointId: "sl-2",
    runCount: 173,
  }),
];

async function seed(): Promise<void> {
  console.log("Connecting to MongoDB...");
  const mongoose = await connect(MONGODB_URL);
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("Database connection failed");
  }

  console.log("Clearing existing seed data...");
  await db.collection("apps").deleteMany({ ownerId: DEMO_USER_ID });
  await db.collection("scenarios").deleteMany({ ownerId: DEMO_USER_ID });

  console.log(`Inserting ${apps.length} apps...`);
  await db.collection("apps").insertMany(apps as never[]);

  console.log(`Inserting ${scenarios.length} scenarios...`);
  await db.collection("scenarios").insertMany(scenarios as never[]);

  console.log("Seed complete!");
  console.log(`  Apps: ${apps.length}`);
  console.log(`  Scenarios: ${scenarios.length}`);

  await disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
