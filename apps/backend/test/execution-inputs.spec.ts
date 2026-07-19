import { describe, it, expect, vi } from "vitest";
import { RunStatus } from "@fuse/shared";
import type { Step } from "@fuse/shared";
import { BadRequestException } from "@nestjs/common";

vi.mock("../src/scenarios/scenario.schema", () => ({
  Scenario: { name: "Scenario" },
  ScenarioSchema: {},
  ScenarioDocument: {},
}));
vi.mock("../src/execution/run.schema", () => ({
  Run: { name: "Run" },
  RunSchema: {},
  RunDocument: {},
  PendingInputDoc: {},
}));

const sqsSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-sqs", () => ({
  SQSClient: class {
    send = sqsSend;
  },
  SendMessageCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { ExecutionService } from "../src/execution/execution.service";

const STEP_WITH_REQUIRED_INPUT: Step = {
  id: "s1",
  title: "Организации",
  type: "api",
  appId: "a1",
  endpointId: "e1",
  method: "GET",
  path: "/orgs",
  mappings: { inn: "user" },
} as Step;

function runModelStub(run?: Record<string, unknown>) {
  const saved = { _id: { toString: () => "run-1" } };
  // `new this.runModel(doc)` — мок должен быть конструктором, не стрелкой.
  const model: any = function (this: Record<string, unknown>, doc: object) {
    Object.assign(this, doc);
    this.save = vi.fn().mockResolvedValue({ ...saved, ...doc });
  };
  model.findById = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue(run ?? null),
  });
  model.findByIdAndUpdate = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue({ _id: saved._id }),
  });
  return model;
}

function scenarioModelStub(steps: Step[]) {
  return {
    findById: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ steps, blocked: false }),
    }),
  } as any;
}

const config = { get: vi.fn().mockReturnValue("http://queue") } as any;
const gateway = { publish: vi.fn() } as any;
const minio = { deleteFile: vi.fn(), getPresignedUrl: vi.fn() } as any;
const notifications = {
  notifyRunEvent: vi.fn().mockResolvedValue(undefined),
  deleteForRun: vi.fn().mockResolvedValue(undefined),
} as any;

function manualInputsStub(required: boolean) {
  return {
    forSteps: vi.fn().mockResolvedValue([
      {
        key: "s0:inn",
        stepPath: [0],
        stepIndex: 0,
        stepTitle: "Организации",
        paramKey: "inn",
        kind: "param",
        label: "ИНН",
        type: "string",
        required,
        source: "form",
      },
    ]),
  } as any;
}

describe("ExecutionService — run inputs", () => {
  it("stores manual inputs on the run", async () => {
    const runModel = runModelStub();
    const service = new ExecutionService(
      runModel,
      scenarioModelStub([STEP_WITH_REQUIRED_INPUT]),
      config,
      gateway,
      manualInputsStub(true),
      minio,
      notifications,
    );

    const run = await service.createRun("u1", "sc1", { "s0:inn": "7707083893" });

    expect(run).toMatchObject({ inputs: { "s0:inn": "7707083893" } });
    expect(sqsSend).toHaveBeenCalled();
  });

  it("rejects a run that misses a required manual value", async () => {
    const service = new ExecutionService(
      runModelStub(),
      scenarioModelStub([STEP_WITH_REQUIRED_INPUT]),
      config,
      gateway,
      manualInputsStub(true),
      minio,
      notifications,
    );

    await expect(service.createRun("u1", "sc1", {})).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.createRun("u1", "sc1", {})).rejects.toThrow(/s0:inn/);
  });

  it("lets an optional manual value be omitted", async () => {
    const service = new ExecutionService(
      runModelStub(),
      scenarioModelStub([STEP_WITH_REQUIRED_INPUT]),
      config,
      gateway,
      manualInputsStub(false),
      minio,
      notifications,
    );

    await expect(service.createRun("u1", "sc1")).resolves.toBeTruthy();
  });
});

describe("ExecutionService — mid-run input submit", () => {
  it("merges submitted values into Run.inputs so a worker restart does not re-ask", async () => {
    const runModel = runModelStub({
      userId: "u1",
      status: RunStatus.WAITING_INPUT,
      currentStep: 2,
      inputs: { "s0:inn": "7707083893" },
    });

    const service = new ExecutionService(
      runModel,
      scenarioModelStub([]),
      config,
      gateway,
      manualInputsStub(true),
      minio,
      notifications,
    );

    await service.submitInputs("run-1", "u1", 2, { "s2:subject": "Привет" });

    const update = runModel.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(update.inputs).toEqual({
      "s0:inn": "7707083893",
      "s2:subject": "Привет",
    });
    expect(update.pendingInput).toEqual({
      stepIndex: 2,
      data: { "s2:subject": "Привет" },
    });
    expect(update.status).toBe(RunStatus.RUNNING);

    // Продолжение исполнения до-ставляется отдельным сообщением: воркер не ждёт
    // в обработчике, а поднимается заново по нему.
    expect(JSON.parse(sqsSend.mock.calls.at(-1)![0].input.MessageBody)).toEqual({
      runId: "run-1",
    });
  });

  it("refuses input for a run that is not waiting", async () => {
    const service = new ExecutionService(
      runModelStub({ userId: "u1", status: RunStatus.RUNNING, currentStep: 2 }),
      scenarioModelStub([]),
      config,
      gateway,
      manualInputsStub(true),
      minio,
      notifications,
    );

    await expect(service.submitInputs("run-1", "u1", 2, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it("writes page data into the pendingInput mailbox", async () => {
    const runModel = runModelStub({
      userId: "u1",
      status: RunStatus.WAITING_INPUT,
      currentStep: 1,
    });

    const service = new ExecutionService(
      runModel,
      scenarioModelStub([]),
      config,
      gateway,
      manualInputsStub(true),
      minio,
      notifications,
    );

    await service.submitPageData("run-1", "u1", 1, { инн: "77" });

    expect(runModel.findByIdAndUpdate.mock.calls[0][1].$set.pendingInput).toEqual({
      stepIndex: 1,
      data: { инн: "77" },
    });

    // submit кладёт сообщение-продолжение в очередь.
    expect(JSON.parse(sqsSend.mock.calls.at(-1)![0].input.MessageBody)).toEqual({
      runId: "run-1",
    });
  });
});
