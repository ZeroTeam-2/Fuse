import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@nestjs/mongoose", () => ({
  Prop: () => () => {},
  Schema: () => (cls: any) => cls,
  SchemaFactory: { createForClass: () => ({ index: () => ({}) }) },
  InjectModel: () => () => {},
}));

vi.mock("mongoose", () => ({
  default: { Schema: { Types: { Mixed: {} } } },
  Schema: { Types: { Mixed: {} } },
  Model: class {},
}));

vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = vi.fn();
  },
}));

vi.mock("sqs-consumer", () => ({
  Consumer: { create: vi.fn() },
}));

import { WorkerService } from "../src/execution/worker.service";

function mockQuery<T>(value: T) {
  return { exec: () => Promise.resolve(value) } as any;
}

/**
 * Прогоняем api-шаг через приватный executeStep и смотрим, какой URL ушёл в
 * fetch: именно здесь раньше уходил относительный путь и Node падал с
 * "Failed to parse URL from /collections".
 */
function makeWorker(app: unknown) {
  const appModel = { findById: vi.fn(() => mockQuery(app)) };
  const runModel = { findById: vi.fn(() => mockQuery(null)), updateOne: vi.fn(() => mockQuery(null)) };
  const scenarioModel = { findById: vi.fn(() => mockQuery(null)) };
  const gateway = { publish: vi.fn() };
  const ssrfGuard = { assertSafeUrl: vi.fn().mockResolvedValue(undefined) };
  const config = { get: vi.fn(() => undefined) };

  const manualInputs = { forSteps: vi.fn().mockResolvedValue([]) };

  const worker = new WorkerService(
    runModel as any,
    scenarioModel as any,
    appModel as any,
    config as any,
    gateway as any,
    ssrfGuard as any,
    manualInputs as any,
    { getObjectBuffer: vi.fn() } as any,
    { notifyRunEvent: vi.fn().mockResolvedValue(undefined) } as any,
  );

  return { worker, ssrfGuard };
}

function runStep(worker: WorkerService, step: unknown) {
  return (worker as any).executeStep(step, {
    runId: "run-1",
    stepIndex: 0,
    stepPath: [0],
    stepResults: [],
    appCache: new Map(),
    runInputs: {},
    descriptors: [],
    warnings: [],
  });
}

const apiStep = {
  id: "s1",
  type: "api",
  title: "Получить список организаций",
  appId: "app-1",
  endpointId: "e1",
  method: "GET",
  path: "/collections",
  mappings: {},
  consts: {},
};

describe("worker: step URL resolution", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve([{ id: "1", name: "ООО Ромашка" }]),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("resolves a relative endpoint path against the app base URL", async () => {
    const { worker } = makeWorker({
      name: "Fake Dadata",
      baseUrl: "https://dadata-fake.cloud.astral-dev.ru",
    });

    const result = await runStep(worker, apiStep);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dadata-fake.cloud.astral-dev.ru/collections",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual([{ id: "1", name: "ООО Ромашка" }]);
  });

  it("preserves the app base path", async () => {
    const { worker } = makeWorker({
      name: "Example",
      baseUrl: "https://api.example.com/v1",
    });

    await runStep(worker, apiStep);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/collections",
      expect.anything(),
    );
  });

  it("checks the resolved URL against the SSRF guard before calling it", async () => {
    const { worker, ssrfGuard } = makeWorker({
      name: "Fake Dadata",
      baseUrl: "https://dadata-fake.cloud.astral-dev.ru",
    });

    await runStep(worker, apiStep);

    expect(ssrfGuard.assertSafeUrl).toHaveBeenCalledWith(
      "https://dadata-fake.cloud.astral-dev.ru/collections",
    );
  });

  it("fails with a domain error when the app has no base URL", async () => {
    const { worker } = makeWorker({ name: "Fake Dadata", baseUrl: undefined });

    await expect(runStep(worker, apiStep)).rejects.toThrow(
      /не задан базовый URL/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails with a domain error when the app is gone", async () => {
    const { worker } = makeWorker(null);

    await expect(runStep(worker, apiStep)).rejects.toThrow(/не найдено/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
