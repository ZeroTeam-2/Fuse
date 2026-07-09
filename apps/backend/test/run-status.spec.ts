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

vi.mock("bullmq", () => {
  return {
    Queue: class MockQueue {
      add = vi.fn().mockResolvedValue(undefined);
      getJob = vi.fn().mockResolvedValue(null);
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

  static findById = vi.fn(() => mockQuery(MockRunModel._findByIdValue));
  static findByIdAndUpdate = vi.fn(() => mockQuery(MockRunModel._findByIdAndUpdateValue));

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

describe("Run status transitions", () => {
  let service: ExecutionService;
  let mockConfig: Partial<ConfigService>;

  beforeEach(() => {
    vi.clearAllMocks();
    setMockValues(null, null);
    mockConfig = {
      get: vi.fn((key: string) => {
        if (key === "REDIS_URL") return "redis://localhost:6379";
        return undefined;
      }),
    };
    service = new ExecutionService(
      MockRunModel as any,
      mockConfig as ConfigService,
    );
  });

  describe("pending → running → completed", () => {
    it("createRun sets initial status to PENDING", async () => {
      const run = await service.createRun("user-1", "scenario-1");
      expect(run.status).toBe(RunStatus.PENDING);
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

  describe("run not found", () => {
    it("getRun throws when run does not exist", async () => {
      setMockValues(null, null);
      await expect(service.getRun("nonexistent")).rejects.toThrow();
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
