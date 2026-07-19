import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunStatus } from "@fuse/shared";
import type { ManualInputDescriptor, Step } from "@fuse/shared";

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
  name: "Организации",
  baseUrl: "https://api.example.com",
  endpoints: [
    {
      id: "e1",
      method: "GET",
      path: "/orgs",
      inputs: [{ key: "inn", label: "ИНН", type: "string", required: true, loc: "query" }],
      outputs: [],
    },
    {
      id: "e2",
      method: "GET",
      path: "/orders",
      inputs: [{ key: "orgId", label: "Организация", type: "string", loc: "query" }],
      outputs: [],
    },
  ],
};

function apiStep(title: string, endpointId: string, extra: Record<string, unknown> = {}): Step {
  return {
    id: title,
    title,
    type: "api",
    appId: "a1",
    endpointId,
    method: "GET",
    path: endpointId === "e1" ? "/orgs" : "/orders",
    ...extra,
  } as Step;
}

function descriptor(over: Partial<ManualInputDescriptor>): ManualInputDescriptor {
  return {
    key: "s0:inn",
    stepPath: [0],
    stepIndex: 0,
    stepTitle: "Шаг",
    paramKey: "inn",
    kind: "param",
    label: "ИНН",
    type: "string",
    required: true,
    ...over,
  };
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

/** Документ запуска мутируется на месте: воркер перечитывает его каждой итерацией. */
function harness(run: Record<string, unknown>, steps: Step[], descriptors: ManualInputDescriptor[]) {
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
      findById: vi.fn(() => ({ exec: () => Promise.resolve({ steps, _id: "sc1" }) })),
      // Счётчик запусков карточки.
      updateOne: vi.fn(() => ({ exec: () => Promise.resolve({}) })),
    } as any,
    { findById: vi.fn(() => ({ exec: () => Promise.resolve(APP) })) } as any,
    { get: vi.fn().mockReturnValue("http://queue") } as any,
    { publish: vi.fn() } as any,
    { assertSafeUrl: vi.fn().mockResolvedValue(undefined) } as any,
    { forSteps: vi.fn().mockResolvedValue(descriptors) } as any,
    { getObjectBuffer: vi.fn().mockResolvedValue(Buffer.from("")) } as any,
  );

  return { worker, runModel, run, gateway: (worker as any).gateway };
}

/**
 * Пользователь отвечает, пока воркер ждёт: как только запуск ушёл в
 * `waiting_input`, следующее чтение видит заполненный ящик и статус `running` —
 * ровно то, что делают `page-submit` / `input-submit`.
 */
function respondWhileWaiting(
  runModel: any,
  run: Record<string, unknown>,
  data: Record<string, unknown>,
  inputs?: Record<string, unknown>,
) {
  runModel.findById = vi.fn(() => ({
    exec: async () => {
      if (run.status === RunStatus.WAITING_INPUT) {
        run.status = RunStatus.RUNNING;
        run.pendingInput = { stepIndex: run.currentStep, data };
        if (inputs) run.inputs = { ...(run.inputs as object), ...inputs };
      }
      return run;
    },
  }));
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ id: "org-1" }),
    text: async () => "{}",
  });
  vi.stubGlobal("fetch", fetchMock);
});

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("WorkerService — manual inputs", () => {
  it("delivers a run input to a step that has no input page", async () => {
    const steps = [apiStep("Организации", "e1", { mappings: { inn: "user" } })];
    const { worker } = harness(
      {
        _id: "run-1",
        scenarioId: "sc1",
        status: RunStatus.PENDING,
        currentStep: 0,
        stepResults: [],
        inputs: { "s0:inn": "7707083893" },
      },
      steps,
      [descriptor({})],
    );

    await (worker as any).executeRun("run-1");

    expect(calledUrls()[0]).toContain("inn=7707083893");
  });

  it("keeps user input alive across steps", async () => {
    // `inn` замаплен на шаге 0 и на шаге 1, но введён только для шага 0:
    // накопленный ввод должен доехать до следующего шага.
    const steps = [
      apiStep("Организации", "e1", { mappings: { inn: "user" } }),
      apiStep("Заказы", "e2", { mappings: { orgId: "user" } }),
    ];

    const { worker } = harness(
      {
        _id: "run-1",
        scenarioId: "sc1",
        status: RunStatus.PENDING,
        currentStep: 0,
        stepResults: [],
        inputs: { "s0:inn": "7707083893", "s1:orgId": "org-42" },
      },
      steps,
      [descriptor({}), descriptor({ key: "s1:orgId", stepPath: [1], stepIndex: 1, paramKey: "orgId" })],
    );

    await (worker as any).executeRun("run-1");

    const urls = calledUrls();
    expect(urls[0]).toContain("inn=7707083893");
    expect(urls[1]).toContain("orgId=org-42");
  });

  it("resolves a filter operand from the run inputs", async () => {
    const steps = [
      apiStep("Организации", "e1", { mappings: { inn: "const" }, consts: { inn: "77" } }),
      apiStep("Заказы", "e2", {
        mappings: { orgId: "s0:id" },
        filters: { orgId: { field: "inn", op: "eq", value: { mode: "user" } } },
      }),
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => [
        { id: "org-1", inn: "111" },
        { id: "org-2", inn: "7707083893" },
      ],
      text: async () => "[]",
    });

    const { worker } = harness(
      {
        _id: "run-1",
        scenarioId: "sc1",
        status: RunStatus.PENDING,
        currentStep: 0,
        stepResults: [],
        inputs: { "s1:filter:orgId": "7707083893" },
      },
      steps,
      [
        descriptor({
          key: "s1:filter:orgId",
          stepPath: [1],
          stepIndex: 1,
          paramKey: "orgId",
          kind: "filter",
        }),
      ],
    );

    await (worker as any).executeRun("run-1");

    // Условие отобрало вторую организацию — в шаг 2 уехал её id.
    expect(calledUrls()[1]).toContain("orgId=org-2");
  });

  it("records page inputs as the page step result and feeds the next step's mapping", async () => {
    const steps = [
      {
        id: "p1",
        title: "Данные",
        type: "page",
        page: {
          title: "Данные",
          rows: [
            {
              id: "r1",
              items: [
                { id: "инн_организации", type: "input", span: 4, label: "ИНН организации", binding: "inn" },
              ],
            },
          ],
        },
      } as Step,
      apiStep("Организации", "e1", { mappings: { inn: "s0:inn" } }),
    ];

    const run: Record<string, unknown> = {
      _id: "run-1",
      scenarioId: "sc1",
      status: RunStatus.PENDING,
      currentStep: 0,
      stepResults: [],
      inputs: {},
    };
    const { worker } = harness(run, steps, []);

    // Фаза 1: воркер доходит до шага-страницы, публикует запрос и ПАУЗИТ
    // (обработчик освобождается, API ещё не вызван).
    await (worker as any).executeRun("run-1");
    expect(run.status).toBe(RunStatus.WAITING_INPUT);
    expect(calledUrls()).toHaveLength(0);

    // submit: пользователь заполнил страницу (ключ поля — id блока
    // `инн_организации`, ключ выхода — `inn`). Это делает
    // ExecutionService.submitPageData + до-ставка сообщения-продолжения.
    run.pendingInput = { stepIndex: 0, data: { инн_организации: "7707083893" } };
    run.status = RunStatus.RUNNING;

    // Фаза 2: результат шага-страницы = введённые значения по ключам выходов;
    // следующий шаг забирает их обычным маппингом `s0:inn`.
    await (worker as any).executeRun("run-1");
    const pageResult = (run.stepResults as any)["0"] ?? (run.stepResults as any)[0];
    expect(pageResult.result).toEqual({ inn: "7707083893" });
    expect(calledUrls()[0]).toContain("inn=7707083893");
    expect(run.status).toBe(RunStatus.COMPLETED);
  });

  it("fails the page step when a required block is submitted empty", async () => {
    const steps = [
      {
        id: "p1",
        title: "Данные",
        type: "page",
        page: {
          title: "Данные",
          rows: [
            {
              id: "r1",
              items: [
                { id: "b1", type: "input", span: 4, label: "ИНН", binding: "inn", required: true },
              ],
            },
          ],
        },
      } as Step,
    ];

    const run: Record<string, unknown> = {
      _id: "run-1",
      scenarioId: "sc1",
      status: RunStatus.RUNNING,
      currentStep: 0,
      stepResults: [],
      inputs: {},
      // Программный сабмит прислал пустое обязательное значение.
      pendingInput: { stepIndex: 0, data: { b1: "" } },
    };
    const { worker } = harness(run, steps, []);

    await (worker as any).executeRun("run-1");

    expect(run.status).toBe(RunStatus.FAILED);
    expect(String(run.error)).toContain("обязательные поля страницы");
  });

  it("publishes a display-only page without pausing and completes the run", async () => {
    const steps = [
      apiStep("Организации", "e2"),
      {
        id: "p1",
        title: "Проверьте",
        type: "page",
        page: {
          title: "Проверьте",
          rows: [
            {
              id: "r1",
              items: [
                { id: "out1", type: "paragraph", span: 4, binding: "s0:id" },
              ],
            },
          ],
        },
      } as Step,
    ];

    const run: Record<string, unknown> = {
      _id: "run-1",
      scenarioId: "sc1",
      status: RunStatus.PENDING,
      currentStep: 0,
      stepResults: [],
      inputs: {},
    };

    const { worker } = harness(run, steps, []);
    const publish = vi.fn();
    (worker as any).gateway = { publish };

    // Display-only страница не блокирует поток: сабмита нет, запуск завершается.
    await (worker as any).executeRun("run-1");

    const page = publish.mock.calls.find((call) => call[1].type === "page:required");
    expect(page).toBeTruthy();
    // Шаг 0 вернул { id: "org-1" } — блок отображения показывает это значение.
    expect(page![1].payload.resolved).toEqual({ out1: "org-1" });
    expect(run.status).toBe(RunStatus.COMPLETED);
  });

  it("resolves dynamic select options from a previous step's array field", async () => {
    const steps = [
      apiStep("Организации", "e2"),
      {
        id: "p1",
        title: "Выбор",
        type: "page",
        page: {
          title: "Выбор",
          rows: [
            {
              id: "r1",
              items: [
                { id: "sel1", type: "select", span: 6, label: "Машина", optionsSource: "s0:cars" },
              ],
            },
          ],
        },
      } as Step,
    ];

    // Шаг 0 отвечает объектом с вложенным массивом `cars`.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ cars: ["Toyota", "BMW", "Lada"] }),
      text: async () => "{}",
    });

    const run: Record<string, unknown> = {
      _id: "run-1",
      scenarioId: "sc1",
      status: RunStatus.PENDING,
      currentStep: 0,
      stepResults: [],
      inputs: {},
    };

    const { worker, runModel } = harness(run, steps, []);
    const publish = vi.fn();
    (worker as any).gateway = { publish };

    respondWhileWaiting(runModel, run, {});

    await (worker as any).executeRun("run-1");

    const page = publish.mock.calls.find((call) => call[1].type === "page:required");
    expect(page).toBeTruthy();
    // Массив `cars` развёрнут в варианты списка.
    expect(page![1].payload.resolved).toEqual({ sel1: ["Toyota", "BMW", "Lada"] });
  });

  it("asks for a missing required value instead of failing the step", async () => {
    const steps = [apiStep("Организации", "e1", { mappings: { inn: "user" } })];

    const run: Record<string, unknown> = {
      _id: "run-1",
      scenarioId: "sc1",
      status: RunStatus.PENDING,
      currentStep: 0,
      stepResults: [],
      inputs: {},
    };

    const { worker } = harness(run, steps, [descriptor({})]);
    const publish = vi.fn();
    (worker as any).gateway = { publish };

    // Фаза 1: обязательного значения нет во входах — воркер публикует
    // input:required и ПАУЗИТ (API не вызывается).
    await (worker as any).executeRun("run-1");

    const asked = publish.mock.calls.find((call) => call[1].type === "input:required");
    expect(asked).toBeTruthy();
    expect(asked![1].payload.fields[0].key).toBe("s0:inn");
    expect(run.status).toBe(RunStatus.WAITING_INPUT);
    expect(calledUrls()).toHaveLength(0);

    // submit добора: значение уходит в `Run.inputs` (переживает продолжение),
    // `pendingInput` — сигнал; ExecutionService до-ставляет сообщение.
    run.inputs = { "s0:inn": "7707083893" };
    run.pendingInput = { stepIndex: 0, data: { "s0:inn": "7707083893" } };
    run.status = RunStatus.RUNNING;

    // Фаза 2: продолжение — значение уже во входах, шаг исполняется.
    await (worker as any).executeRun("run-1");
    expect(calledUrls()[0]).toContain("inn=7707083893");
    expect(run.status).toBe(RunStatus.COMPLETED);
  });

  it("does not re-ask for a value already topped up into Run.inputs", async () => {
    const steps = [apiStep("Организации", "e1", { mappings: { inn: "user" } })];

    const { worker } = harness(
      {
        _id: "run-1",
        scenarioId: "sc1",
        // Повторная доставка сообщения: значение уже добрано и лежит во входах.
        status: RunStatus.RUNNING,
        currentStep: 0,
        stepResults: [],
        inputs: { "s0:inn": "7707083893" },
      },
      steps,
      [descriptor({})],
    );
    const publish = vi.fn();
    (worker as any).gateway = { publish };

    await (worker as any).executeRun("run-1");

    expect(publish.mock.calls.some((call) => call[1].type === "input:required")).toBe(false);
    expect(calledUrls()[0]).toContain("inn=7707083893");
  });
});
