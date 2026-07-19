import { describe, it, expect, vi } from "vitest";

vi.mock("@nestjs/mongoose", () => ({
  Prop: () => () => {},
  Schema: () => (cls: any) => cls,
  SchemaFactory: { createForClass: () => ({}) },
  InjectModel: () => () => {},
}));

vi.mock("mongoose", () => ({
  default: { Schema: { Types: { Mixed: {} } } },
  Schema: { Types: { Mixed: {} } },
  Model: class {},
}));

vi.mock("sqs-consumer", () => ({ Consumer: { create: vi.fn() } }));
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = vi.fn();
  },
}));

import { AppsService } from "../src/apps/apps.service";
import { OpenApiParserService } from "../src/apps/openapi-parser";

/** Минимальная валидная спека с двумя endpoints; servers управляется параметром. */
function specYaml(withServers: boolean): string {
  return [
    "openapi: 3.0.0",
    "info:",
    "  title: Demo",
    "  version: 2.0.0",
    ...(withServers ? ["servers:", "  - url: https://new.example.com"] : []),
    "paths:",
    "  /task/{task_id}:",
    "    get:",
    "      summary: Task status",
    "      responses:",
    '        "200":',
    "          description: OK",
    "  /new:",
    "    get:",
    "      summary: Brand new",
    "      responses:",
    '        "200":',
    "          description: OK",
    "",
  ].join("\n");
}

const APP_DOC = () => ({
  _id: "app-1",
  ownerId: "u1",
  baseUrl: "https://old.example.com",
  host: "old.example.com",
  apiVersion: "1.0.0",
  environments: [{ id: "env-1", name: "Prod", variables: [] }],
  endpoints: [
    { id: "ep-task", method: "GET", path: "/task/{task_id}", inputs: [], outputs: [], status: "active" },
    { id: "ep-old", method: "POST", path: "/legacy", inputs: [], outputs: [], status: "active" },
  ],
});

function harness(app = APP_DOC()) {
  const captured: { update?: Record<string, any> } = {};

  const appModel: any = {
    findOne: vi.fn(() => ({ exec: () => Promise.resolve(app) })),
    findOneAndUpdate: vi.fn((_f: unknown, update: any) => {
      captured.update = update.$set;
      return { exec: () => Promise.resolve({ ...app, ...update.$set }) };
    }),
  };

  const service = new AppsService(
    appModel,
    {} as any,
    new OpenApiParserService(),
    {} as any,
    {} as any,
  );

  return { service, captured };
}

const FILE = (withServers = false) => ({
  specText: specYaml(withServers),
  contentType: "application/yaml",
});

describe("AppsService — reimport from file", () => {
  it("builds the same diff shape as the URL reimport", async () => {
    const { service } = harness();

    const diff = await service.reimportFromFile("app-1", "u1", FILE());

    expect(diff.added.map((e) => e.path)).toEqual(["/new"]);
    expect(diff.kept.map((e) => e.path)).toEqual(["/task/{task_id}"]);
    expect(diff.deprecated.map((e) => e.path)).toEqual(["/legacy"]);
  });

  it("apply merges endpoints: matched keep their id, missing become deprecated", async () => {
    const { service, captured } = harness();

    await service.applyReimportFromFile("app-1", "u1", FILE());
    const endpoints = captured.update!.endpoints;

    // Совпавший endpoint сохранил id — на него ссылаются шаги сценариев.
    expect(endpoints.find((e: any) => e.path === "/task/{task_id}")?.id).toBe("ep-task");
    expect(endpoints.find((e: any) => e.path === "/new")?.status).toBe("active");
    expect(endpoints.find((e: any) => e.path === "/legacy")?.status).toBe("deprecated");
  });

  it("apply keeps the app's baseUrl when the file has no servers", async () => {
    const { service, captured } = harness();

    await service.applyReimportFromFile("app-1", "u1", FILE(false));

    expect(captured.update!.baseUrl).toBe("https://old.example.com");
    expect(captured.update!.host).toBe("old.example.com");
    // Версия из файла при этом обновляется.
    expect(captured.update!.apiVersion).toBe("2.0.0");
  });

  it("apply takes the baseUrl from the file's servers when present", async () => {
    const { service, captured } = harness();

    await service.applyReimportFromFile("app-1", "u1", FILE(true));

    expect(captured.update!.baseUrl).toBe("https://new.example.com");
    expect(captured.update!.host).toBe("new.example.com");
  });

  it("apply honours an explicit baseUrl override", async () => {
    const { service, captured } = harness();

    await service.applyReimportFromFile("app-1", "u1", {
      ...FILE(false),
      baseUrlOverride: "https://override.example.com",
    });

    expect(captured.update!.baseUrl).toBe("https://override.example.com");
  });
});
