import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunStatus } from "@fuse/shared";
import type { Step } from "@fuse/shared";

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

import { WorkerService } from "../src/execution/worker.service";

const APP = {
  _id: "a1",
  name: "Распознавание",
  baseUrl: "https://api.example.com",
  endpoints: [
    {
      id: "up1",
      method: "POST",
      path: "/upload",
      inputs: [
        { key: "document", label: "Документ", type: "file", loc: "body" },
        { key: "comment", label: "Комментарий", type: "string", loc: "body" },
      ],
      outputs: [],
    },
    {
      id: "st1",
      method: "GET",
      path: "/status/{taskId}",
      inputs: [{ key: "taskId", label: "Задача", type: "string", loc: "path" }],
      outputs: [],
    },
  ],
};

const FILE_REF = {
  objectName: "uploads/u1/doc.pdf",
  fileName: "doc.pdf",
  fileSize: 3,
  fileType: "application/pdf",
};

function fileStep(extra: Record<string, unknown> = {}): Step {
  return {
    id: "f1",
    title: "Загрузка документа",
    type: "file",
    appId: "a1",
    uploadMethod: "POST",
    uploadPath: "/upload",
    page: {
      title: "Файл",
      rows: [
        {
          id: "r1",
          items: [
            { id: "dz1", type: "dropzone", span: 6, label: "Документ", binding: "document", required: true },
          ],
        },
      ],
    },
    ...extra,
  } as Step;
}

function harness(run: Record<string, unknown>, steps: Step[], app: unknown = APP) {
  const runModel: any = {
    findById: vi.fn(() => ({ exec: () => Promise.resolve(run) })),
    updateOne: vi.fn((_filter: unknown, update: any) => {
      for (const [key, value] of Object.entries(update.$set ?? {})) {
        const [head, ...rest] = key.split(".");
        if (rest.length === 0) {
          run[head] = value;
        } else {
          const next = ((run[head] ??= {}) as Record<string, unknown>);
          next[rest.join(".")] = value;
        }
      }
      for (const key of Object.keys(update.$unset ?? {})) delete run[key];
      return { exec: () => Promise.resolve({}) };
    }),
  };

  const minio = { getObjectBuffer: vi.fn().mockResolvedValue(Buffer.from("PDF")) };

  const worker = new WorkerService(
    runModel,
    {
      findById: vi.fn(() => ({ exec: () => Promise.resolve({ steps, _id: "sc1" }) })),
      updateOne: vi.fn(() => ({ exec: () => Promise.resolve({}) })),
    } as any,
    { findById: vi.fn(() => ({ exec: () => Promise.resolve(app) })) } as any,
    { get: vi.fn().mockReturnValue("http://queue") } as any,
    { publish: vi.fn() } as any,
    { assertSafeUrl: vi.fn().mockResolvedValue(undefined) } as any,
    { forSteps: vi.fn().mockResolvedValue([]) } as any,
    minio as any,
  );

  // Опрос без реальных пауз.
  (worker as any).sleep = vi.fn().mockResolvedValue(undefined);

  return { worker, runModel, run, minio };
}

const fetchMock = vi.fn();

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

/** Запуск, уже продолженный после сабмита страницы с загруженным файлом. */
function submittedRun(): Record<string, unknown> {
  return {
    _id: "run-1",
    scenarioId: "sc1",
    status: RunStatus.RUNNING,
    currentStep: 0,
    stepResults: [],
    inputs: {},
    pendingInput: { stepIndex: 0, data: { dz1: FILE_REF } },
  };
}

describe("WorkerService — file step", () => {
  it("delivers the uploaded file to the provider as multipart with text fields alongside", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ received: true }));

    const run = submittedRun();
    const { worker, minio } = harness(run, [
      fileStep({ mappings: { comment: "const" }, consts: { comment: "скан договора" } }),
    ]);

    await (worker as any).executeRun("run-1");

    expect(minio.getObjectBuffer).toHaveBeenCalledWith("uploads/u1/doc.pdf");
    expect(run.status).toBe(RunStatus.COMPLETED);

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.example.com/upload");
    expect(options.method).toBe("POST");
    // Content-Type с boundary выставляет fetch — руками он не задан.
    expect((options.headers ?? {})["Content-Type"]).toBeUndefined();

    const form = options.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const filePart = form.get("document") as File;
    expect(filePart).toBeInstanceOf(Blob);
    expect(filePart.name).toBe("doc.pdf");
    expect(filePart.type).toBe("application/pdf");
    expect(await filePart.text()).toBe("PDF");
    expect(form.get("comment")).toBe("скан договора");

    // Результат шага — ответ провайдера, без ссылок хранилища.
    const result = (run.stepResults as any).length
      ? (run.stepResults as any)[0].result
      : (run.stepResults as any)["0"]?.result;
    expect(result).toEqual({ received: true });
  });

  it("polls statusEndpoint with the task id from the upload response and publishes progress", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ taskId: "t-42" }))
      .mockResolvedValueOnce(jsonResponse({ status: "processing", percent: 50 }))
      .mockResolvedValueOnce(jsonResponse({ status: "done", percent: 100, text: "распознано" }));

    const run = submittedRun();
    const { worker } = harness(run, [
      fileStep({
        statusEndpoint: { method: "GET", path: "/status/{taskId}", intervalSec: 1, progressField: "percent" },
      }),
    ]);
    const publish = vi.fn();
    (worker as any).gateway = { publish };

    await (worker as any).executeRun("run-1");

    // id задачи из ответа загрузки подставлен в путь статуса.
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.example.com/status/t-42");

    const progressEvents = publish.mock.calls
      .filter((call) => call[1].type === "progress")
      .map((call) => call[1].payload.progress);
    expect(progressEvents).toEqual([50, 100]);

    // Результат шага — финальный ответ опроса.
    const results = run.stepResults as any;
    const result = results.length ? results[0].result : results["0"]?.result;
    expect(result).toEqual({ status: "done", percent: 100, text: "распознано" });
    expect(run.status).toBe(RunStatus.COMPLETED);
  });

  it("falls back to the dropzone binding for the multipart field when the schema types the file input as string", async () => {
    // Спека, импортированная до маппинга `format: binary` → `file`: файловый
    // body-вход `document` помечен строкой, рядом второй строковый вход.
    const legacyApp = {
      ...APP,
      endpoints: [
        {
          ...APP.endpoints[0],
          inputs: [
            { key: "document", label: "Документ", type: "string", loc: "body" },
            { key: "comment", label: "Комментарий", type: "string", loc: "body" },
          ],
        },
        APP.endpoints[1],
      ],
    };

    fetchMock.mockResolvedValue(jsonResponse({ received: true }));

    const run = submittedRun();
    const { worker } = harness(run, [fileStep()], legacyApp);

    await (worker as any).executeRun("run-1");

    expect(run.status).toBe(RunStatus.COMPLETED);
    const form = fetchMock.mock.calls[0][1].body as FormData;
    // Файл уехал в поле по привязке блока, а не в фолбэк "file".
    expect(form.get("document")).toBeInstanceOf(Blob);
    expect(form.get("file")).toBeNull();
  });

  it("fails the run with a domain error when no file reference was submitted", async () => {
    const run = submittedRun();
    // Сабмит страницы прошёл, но файловой ссылки в данных нет (обход клиента).
    run.pendingInput = { stepIndex: 0, data: { dz1: { fileName: "doc.pdf" } } };

    const { worker } = harness(run, [fileStep()]);

    await (worker as any).executeRun("run-1");

    expect(run.status).toBe(RunStatus.FAILED);
    expect(String(run.error)).toContain("файл не был загружен");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
