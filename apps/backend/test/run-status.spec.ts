import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunStatus } from "@fuse/shared";
import { ConfigService } from "@nestjs/config";

vi.mock("@nestjs/mongoose", () => ({
  Prop: () => () => {},
  Schema: () => (cls: any) => cls,
  SchemaFactory: {
    createForClass: () => ({}),
  },
  InjectModel: () => () => {},
}));

vi.mock("mongoose", () => ({
  default: { Schema: { Types: { Mixed: {} } } },
  Schema: { Types: { Mixed: {} } },
  Model: class {},
}));

vi.mock("@aws-sdk/client-sqs", () => {
  return {
    SQSClient: class MockSQSClient {
      send = vi.fn().mockResolvedValue(undefined);
    },
    SendMessageCommand: class MockSendMessageCommand {
      constructor(public input: unknown) {}
    },
  };
});

import { ExecutionService } from "../src/execution/execution.service";

function mockQuery<T>(value: T) {
  return { exec: () => Promise.resolve(value) } as any;
}

class MockRunModel {
  static _findByIdValue: any = null;
  static _findByIdAndUpdateValue: any = null;
  static _findValue: any[] = [];
  static _updateManyResult: any = { acknowledged: true };

  static findById = vi.fn(() => mockQuery(MockRunModel._findByIdValue));
  static findByIdAndUpdate = vi.fn(() => mockQuery(MockRunModel._findByIdAndUpdateValue));
  static find = vi.fn(() => mockQuery(MockRunModel._findValue));
  static updateMany = vi.fn(() => mockQuery(MockRunModel._updateManyResult));

  [k: string]: any;

  constructor(data: any) {
    Object.assign(this, data);
  }

  save() {
    return Promise.resolve({
      ...this,
      _id: "run-mock-id",
      status: (this as any).status ?? RunStatus.PENDING,
    });
  }
}

function setMockValues(findById: any, findByIdAndUpdate: any) {
  MockRunModel._findByIdValue = findById;
  MockRunModel._findByIdAndUpdateValue = findByIdAndUpdate;
  MockRunModel.findById = vi.fn(() => mockQuery(findById));
  MockRunModel.findByIdAndUpdate = vi.fn(() => mockQuery(findByIdAndUpdate));
}

function setMockActiveRuns(runs: any[]) {
  MockRunModel._findValue = runs;
  MockRunModel.find = vi.fn(() => mockQuery(runs));
  MockRunModel.updateMany = vi.fn(() => mockQuery({ acknowledged: true }));
}

class MockScenarioModel {
  static _findByIdValue: any = { _id: "scenario-1", blocked: false };
  static findById = vi.fn(() => mockQuery(MockScenarioModel._findByIdValue));
}

function setMockScenario(scenario: any) {
  MockScenarioModel._findByIdValue = scenario;
  MockScenarioModel.findById = vi.fn(() => mockQuery(scenario));
}

describe("Run status transitions", () => {
  let service: ExecutionService;
  let mockConfig: Partial<ConfigService>;
  let mockGateway: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    setMockValues(null, null);
    setMockScenario({ _id: "scenario-1", blocked: false });
    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === "AWS_SQS_QUEUE_URL") return "http://localhost:4566/000000000000/scenario-execution";
        if (key === "AWS_REGION") return "us-east-1";
        if (key === "AWS_ACCESS_KEY_ID") return "test";
        if (key === "AWS_SECRET_ACCESS_KEY") return "test";
        return undefined;
      }),
    };
    mockGateway = { publish: vi.fn() };
    service = new ExecutionService(
      MockRunModel as any,
      MockScenarioModel as any,
      mockConfig as ConfigService,
      mockGateway as any,
      { forSteps: vi.fn().mockResolvedValue([]) } as any,
    );
  });

  describe("pending → running → completed", () => {
    it("createRun sets initial status to PENDING", async () => {
      const run = await service.createRun("user-1", "scenario-1");
      expect(run.status).toBe(RunStatus.PENDING);
    });

    it("createRun rejects when the scenario is blocked", async () => {
      setMockScenario({
        _id: "scenario-1",
        blocked: true,
        blockedReason: "Приложение «X» удалено",
      });

      await expect(
        service.createRun("user-1", "scenario-1"),
      ).rejects.toThrow(/удалено/);
    });

    it("createRun rejects when the scenario does not exist", async () => {
      setMockScenario(null);

      await expect(
        service.createRun("user-1", "scenario-missing"),
      ).rejects.toThrow();
    });

    it("RunStatus enum defines the full lifecycle", () => {
      expect(RunStatus.PENDING).toBe("pending");
      expect(RunStatus.RUNNING).toBe("running");
      expect(RunStatus.COMPLETED).toBe("completed");
      expect(RunStatus.FAILED).toBe("failed");
      expect(RunStatus.WAITING_INPUT).toBe("waiting_input");
      expect(RunStatus.CANCELLED).toBe("cancelled");
    });
  });

  describe("running → cancelled", () => {
    it("cancelRun transitions RUNNING to CANCELLED", async () => {
      const cancelledRun = { _id: "run-1", status: RunStatus.CANCELLED };
      setMockValues(
        { _id: "run-1", status: RunStatus.RUNNING },
        cancelledRun,
      );

      const result = await service.cancelRun("run-1");
      expect(result.status).toBe(RunStatus.CANCELLED);
    });

    it("cancelRun rejects when already COMPLETED", async () => {
      setMockValues({ _id: "run-1", status: RunStatus.COMPLETED }, null);
      await expect(service.cancelRun("run-1")).rejects.toThrow();
    });

    it("cancelRun rejects when already FAILED", async () => {
      setMockValues({ _id: "run-1", status: RunStatus.FAILED }, null);
      await expect(service.cancelRun("run-1")).rejects.toThrow();
    });

    it("cancelRun rejects when already CANCELLED", async () => {
      setMockValues({ _id: "run-1", status: RunStatus.CANCELLED }, null);
      await expect(service.cancelRun("run-1")).rejects.toThrow();
    });

    it("cancelRun succeeds when WAITING_INPUT", async () => {
      const cancelledRun = { _id: "run-1", status: RunStatus.CANCELLED };
      setMockValues(
        { _id: "run-1", status: RunStatus.WAITING_INPUT },
        cancelledRun,
      );

      const result = await service.cancelRun("run-1");
      expect(result.status).toBe(RunStatus.CANCELLED);
    });
  });

  describe("running → waiting_input → running", () => {
    it("submitPageData transitions WAITING_INPUT to RUNNING", async () => {
      const runningRun = {
        _id: "run-1",
        status: RunStatus.RUNNING,
        currentStep: 2,
        pageData: { name: "test" },
      };
      setMockValues(
        { _id: "run-1", status: RunStatus.WAITING_INPUT, currentStep: 2 },
        runningRun,
      );

      const result = await service.submitPageData("run-1", 2, { name: "test" });
      expect(result.status).toBe(RunStatus.RUNNING);
    });

    it("submitPageData rejects when status is RUNNING", async () => {
      setMockValues(
        { _id: "run-1", status: RunStatus.RUNNING, currentStep: 0 },
        null,
      );
      await expect(
        service.submitPageData("run-1", 0, { foo: "bar" }),
      ).rejects.toThrow();
    });

    it("submitPageData rejects when status is COMPLETED", async () => {
      setMockValues(
        { _id: "run-1", status: RunStatus.COMPLETED, currentStep: 5 },
        null,
      );
      await expect(
        service.submitPageData("run-1", 5, {}),
      ).rejects.toThrow();
    });

    it("submitPageData rejects when stepIndex does not match currentStep", async () => {
      setMockValues(
        { _id: "run-1", status: RunStatus.WAITING_INPUT, currentStep: 3 },
        null,
      );
      await expect(
        service.submitPageData("run-1", 5, {}),
      ).rejects.toThrow();
    });
  });

  describe("run ownership", () => {
    it("getRun returns the run to its owner", async () => {
      setMockValues(
        { _id: "run-1", userId: "user-1", status: RunStatus.COMPLETED },
        null,
      );

      const run = await service.getRun("run-1", "user-1");
      expect(run.status).toBe(RunStatus.COMPLETED);
    });

    it("getRun rejects a run belonging to another user", async () => {
      setMockValues(
        { _id: "run-1", userId: "user-1", status: RunStatus.COMPLETED },
        null,
      );

      await expect(service.getRun("run-1", "user-2")).rejects.toThrow(
        /another user/,
      );
    });
  });

  describe("cancelActiveRunsForScenarios (stop already-running scenarios on delete)", () => {
    it("cancels every non-terminal run for the given scenarios", async () => {
      const activeRuns = [
        { _id: "run-1", scenarioId: "scenario-1", status: RunStatus.RUNNING, currentStep: 1, stepResults: [] },
        { _id: "run-2", scenarioId: "scenario-1", status: RunStatus.WAITING_INPUT, currentStep: 2, stepResults: [] },
      ];
      setMockActiveRuns(activeRuns);

      const count = await service.cancelActiveRunsForScenarios(["scenario-1"]);

      expect(count).toBe(2);
      expect(MockRunModel.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ["run-1", "run-2"] } },
        { $set: { status: RunStatus.CANCELLED } },
      );
      expect(mockGateway.publish).toHaveBeenCalledTimes(2);
      expect(mockGateway.publish).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          type: "run:status",
          payload: expect.objectContaining({ status: RunStatus.CANCELLED }),
        }),
      );
    });

    it("does nothing when there are no active runs", async () => {
      setMockActiveRuns([]);

      const count = await service.cancelActiveRunsForScenarios(["scenario-1"]);

      expect(count).toBe(0);
      expect(MockRunModel.updateMany).not.toHaveBeenCalled();
      expect(mockGateway.publish).not.toHaveBeenCalled();
    });

    it("does nothing when no scenario ids are provided", async () => {
      const count = await service.cancelActiveRunsForScenarios([]);
      expect(count).toBe(0);
      expect(MockRunModel.find).not.toHaveBeenCalled();
    });
  });

  describe("run not found", () => {
    it("getRun throws when run does not exist", async () => {
      setMockValues(null, null);
      await expect(service.getRun("nonexistent", "user-1")).rejects.toThrow();
    });

    it("cancelRun throws when run does not exist", async () => {
      setMockValues(null, null);
      await expect(service.cancelRun("nonexistent")).rejects.toThrow();
    });

    it("submitPageData throws when run does not exist", async () => {
      setMockValues(null, null);
      await expect(
        service.submitPageData("nonexistent", 0, {}),
      ).rejects.toThrow();
    });
  });
});
