import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunStatus } from "@fuse/shared";
import type { ScenarioAuthEntry, Step } from "@fuse/shared";

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

vi.mock("sqs-consumer", () => ({ Consumer: { create: vi.fn() } }));
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = vi.fn();
  },
}));

import { WorkerService } from "../src/execution/worker.service";

const APP = {
  _id: "a1",
  name: "Bearer API",
  baseUrl: "https://api.example.com",
  endpoints: [
    {
      id: "e1",
      method: "GET",
      path: "/secure",
      inputs: [],
      outputs: [],
    },
  ],
};

function apiStep(extra: Record<string, unknown> = {}): Step {
  return {
    id: "s1",
    title: "Secure call",
    type: "api",
    appId: "a1",
    endpointId: "e1",
    method: "GET",
    path: "/secure",
    ...extra,
  } as Step;
}

/** Воркер пишет результаты адресно (`stepResults.0`) — мок обязан понимать точечный путь. */
function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const [head, ...rest] = path.split(".");
  if (rest.length === 0) {
    target[head] = value;
    return;
  }
  const next = (target[head] ??= {}) as Record<string, unknown>;
  setPath(next, rest.join("."), value);
}

function harness(
  run: Record<string, unknown>,
  steps: Step[],
  authConfig: ScenarioAuthEntry[] = [],
) {
  const runModel: any = {
    findById: vi.fn(() => ({ exec: () => Promise.resolve(run) })),
    updateOne: vi.fn((_filter: unknown, update: any) => {
      for (const [key, value] of Object.entries(update.$set ?? {})) {
        setPath(run, key, value);
      }
      for (const key of Object.keys(update.$unset ?? {})) delete run[key];
      return { exec: () => Promise.resolve({}) };
    }),
  };

  const worker = new WorkerService(
    runModel,
    {
      findById: vi.fn(() => ({
        exec: () => Promise.resolve({ steps, authConfig, _id: "sc1" }),
      })),
      updateOne: vi.fn(() => ({ exec: () => Promise.resolve({}) })),
    } as any,
    { findById: vi.fn(() => ({ exec: () => Promise.resolve(APP) })) } as any,
    { get: vi.fn().mockReturnValue("http://queue") } as any,
    { publish: vi.fn() } as any,
    { assertSafeUrl: vi.fn().mockResolvedValue(undefined) } as any,
    { forSteps: vi.fn().mockResolvedValue([]) } as any,
    { getObjectBuffer: vi.fn().mockResolvedValue(Buffer.from("")) } as any,
    { notifyRunEvent: vi.fn().mockResolvedValue(undefined) } as any,
  );

  return { worker, runModel, run };
}

function baseRun(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "run-1",
    scenarioId: "sc1",
    status: RunStatus.PENDING,
    currentStep: 0,
    stepResults: [],
    inputs: {},
    ...over,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ ok: true }),
    text: async () => "{}",
  });
  vi.stubGlobal("fetch", fetchMock);
});

function lastHeaders(): Record<string, string> {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return (call[1] as RequestInit).headers as Record<string, string>;
}

describe("WorkerService — scenario auth injection", () => {
  it("injects a Bearer header from the scenario's authConfig", async () => {
    const steps = [apiStep({ authEnabled: true })];
    const { worker, run } = harness(baseRun(), steps, [
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-secret" },
    ]);

    await (worker as any).executeRun("run-1");

    expect(lastHeaders().Authorization).toBe("Bearer tok-secret");
    expect(run.status).toBe(RunStatus.COMPLETED);
  });

  it("injects a raw API key header from the scenario's authConfig", async () => {
    const steps = [apiStep({ authEnabled: true })];
    const { worker } = harness(baseRun(), steps, [
      { appId: "a1", headerName: "X-Api-Key", valueFormat: "raw", value: "key-123" },
    ]);

    await (worker as any).executeRun("run-1");

    expect(lastHeaders()["X-Api-Key"]).toBe("key-123");
  });

  it("lets an explicit header mapping override the scenario auth key", async () => {
    const steps = [
      apiStep({
        authEnabled: true,
        mappings: { Authorization: "const" },
        consts: { Authorization: "Bearer from-mapping" },
      }),
    ];
    const { worker } = harness(baseRun(), steps, [
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-secret" },
    ]);

    // The endpoint schema must describe the mapped field as a header input,
    // otherwise the resolver has nowhere to place it.
    APP.endpoints[0].inputs = [
      { key: "Authorization", label: "Authorization", type: "string", loc: "header" },
    ] as never;

    await (worker as any).executeRun("run-1");

    expect(lastHeaders().Authorization).toBe("Bearer from-mapping");

    APP.endpoints[0].inputs = [] as never;
  });

  it("does not inject anything when authEnabled is false", async () => {
    const steps = [apiStep({ authEnabled: false })];
    const { worker } = harness(baseRun(), steps, [
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-secret" },
    ]);

    await (worker as any).executeRun("run-1");

    expect(lastHeaders().Authorization).toBeUndefined();
  });

  it("fails the step with a domain error (no fetch) when authEnabled but no key is configured", async () => {
    const steps = [apiStep({ authEnabled: true })];
    const { worker, run } = harness(baseRun(), steps, []);

    await (worker as any).executeRun("run-1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(run.status).toBe(RunStatus.FAILED);
    expect(String(run.error)).toContain("Авторизация");
  });

  it("fails the step when the configured key has an empty value", async () => {
    const steps = [apiStep({ authEnabled: true })];
    const { worker, run } = harness(baseRun(), steps, [
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "" },
    ]);

    await (worker as any).executeRun("run-1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(run.status).toBe(RunStatus.FAILED);
  });

  it("never leaks the key value into the step error message", async () => {
    const steps = [apiStep({ authEnabled: true })];
    const { worker, run } = harness(baseRun(), steps, []);

    await (worker as any).executeRun("run-1");

    expect(String(run.error)).not.toContain("tok-secret");
  });

  // `authEnabled: undefined` is the state `enableAuthForProvider` (frontend
  // store) resets steps to right after a key is saved on the «Авторизация»
  // tab — it must behave like an auto-on, not like `false`.
  it("injects the key when authEnabled is undefined and a key is configured", async () => {
    const steps = [apiStep()];
    const { worker } = harness(baseRun(), steps, [
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-secret" },
    ]);

    await (worker as any).executeRun("run-1");

    expect(lastHeaders().Authorization).toBe("Bearer tok-secret");
  });

  it("silently skips (no domain error) when authEnabled is undefined and no key is configured", async () => {
    const steps = [apiStep()];
    const { worker, run } = harness(baseRun(), steps, []);

    await (worker as any).executeRun("run-1");

    expect(fetchMock).toHaveBeenCalled();
    expect(lastHeaders().Authorization).toBeUndefined();
    expect(run.status).toBe(RunStatus.COMPLETED);
  });
});
