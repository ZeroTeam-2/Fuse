import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunStatus } from "@fuse/shared";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

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

const FILES = [
  {
    objectName: "runs/u1/run-1/0-abc.pdf",
    fileName: "report.pdf",
    fileSize: 10,
    fileType: "application/pdf",
  },
  {
    objectName: "uploads/u1/xyz.csv",
    fileName: "input.csv",
    fileSize: 5,
    fileType: "text/csv",
  },
];

function buildService(run: Record<string, unknown> | null) {
  const runModel: any = {
    findById: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(run) }),
    deleteOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({}) }),
  };
  const minio = {
    deleteFile: vi.fn().mockResolvedValue(undefined),
    getPresignedUrl: vi.fn().mockResolvedValue("https://s3/presigned"),
  };
  const notifications = {
    notifyRunEvent: vi.fn().mockResolvedValue(undefined),
    deleteForRun: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ExecutionService(
    runModel,
    { findById: vi.fn() } as any,
    { get: vi.fn().mockReturnValue("http://queue") } as any,
    { publish: vi.fn() } as any,
    { forSteps: vi.fn().mockResolvedValue([]) } as any,
    minio as any,
    notifications as any,
  );
  return { service, runModel, minio, notifications };
}

beforeEach(() => sqsSend.mockClear());

describe("deleteRun — каскадное удаление запуска", () => {
  it("удаляет файлы из S3, уведомления и сам документ", async () => {
    const { service, runModel, minio, notifications } = buildService({
      _id: "run-1",
      userId: "u1",
      status: RunStatus.COMPLETED,
      files: FILES,
    });

    await service.deleteRun("run-1", "u1");

    expect(minio.deleteFile).toHaveBeenCalledTimes(2);
    expect(minio.deleteFile).toHaveBeenCalledWith("runs/u1/run-1/0-abc.pdf");
    expect(minio.deleteFile).toHaveBeenCalledWith("uploads/u1/xyz.csv");
    expect(notifications.deleteForRun).toHaveBeenCalledWith("run-1");
    expect(runModel.deleteOne).toHaveBeenCalledWith({ _id: "run-1" });
  });

  it("отклоняет удаление активного запуска с подсказкой отменить", async () => {
    const { service, runModel, minio } = buildService({
      _id: "run-1",
      userId: "u1",
      status: RunStatus.RUNNING,
      files: FILES,
    });

    await expect(service.deleteRun("run-1", "u1")).rejects.toThrow(ConflictException);
    expect(minio.deleteFile).not.toHaveBeenCalled();
    expect(runModel.deleteOne).not.toHaveBeenCalled();
  });

  it("чужой запуск удалить нельзя", async () => {
    const { service, runModel } = buildService({
      _id: "run-1",
      userId: "someone-else",
      status: RunStatus.COMPLETED,
      files: [],
    });

    await expect(service.deleteRun("run-1", "u1")).rejects.toThrow(ForbiddenException);
    expect(runModel.deleteOne).not.toHaveBeenCalled();
  });

  it("ошибка удаления одного объекта S3 не прерывает каскад", async () => {
    const { service, runModel, minio } = buildService({
      _id: "run-1",
      userId: "u1",
      status: RunStatus.FAILED,
      files: FILES,
    });
    minio.deleteFile.mockRejectedValueOnce(new Error("NoSuchKey"));

    await service.deleteRun("run-1", "u1");

    expect(minio.deleteFile).toHaveBeenCalledTimes(2);
    expect(runModel.deleteOne).toHaveBeenCalled();
  });
});

describe("getFileLink — presigned-ссылка на файл запуска", () => {
  it("выдаёт ссылку владельцу на файл из реестра", async () => {
    const { service, minio } = buildService({
      _id: "run-1",
      userId: "u1",
      status: RunStatus.COMPLETED,
      files: FILES,
    });

    const link = await service.getFileLink("run-1", "u1", "runs/u1/run-1/0-abc.pdf");

    expect(link).toEqual({ url: "https://s3/presigned", fileName: "report.pdf" });
    expect(minio.getPresignedUrl).toHaveBeenCalledWith("runs/u1/run-1/0-abc.pdf");
  });

  it("objectName вне реестра запуска — 404, presigned не выдаётся", async () => {
    const { service, minio } = buildService({
      _id: "run-1",
      userId: "u1",
      status: RunStatus.COMPLETED,
      files: FILES,
    });

    await expect(
      service.getFileLink("run-1", "u1", "uploads/other-user/secret.pdf"),
    ).rejects.toThrow(NotFoundException);
    expect(minio.getPresignedUrl).not.toHaveBeenCalled();
  });

  it("чужой запуск — 403", async () => {
    const { service } = buildService({
      _id: "run-1",
      userId: "someone-else",
      status: RunStatus.COMPLETED,
      files: FILES,
    });

    await expect(
      service.getFileLink("run-1", "u1", "runs/u1/run-1/0-abc.pdf"),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe("listRuns — история запусков пользователя", () => {
  function buildListService(runs: Record<string, unknown>[], scenarios: Record<string, unknown>[]) {
    const exec = (value: unknown) => ({ exec: vi.fn().mockResolvedValue(value) });
    const query: any = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(runs),
    };
    const runModel: any = {
      find: vi.fn().mockReturnValue(query),
      countDocuments: vi.fn().mockReturnValue(exec(runs.length)),
    };
    const scenarioModel: any = {
      find: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(exec(scenarios)),
      }),
    };
    const service = new ExecutionService(
      runModel,
      scenarioModel,
      { get: vi.fn().mockReturnValue("http://queue") } as any,
      { publish: vi.fn() } as any,
      { forSteps: vi.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
    );
    return { service, runModel, query };
  }

  const RUN_DOC = {
    _id: { toString: () => "run-1" },
    scenarioId: "sc1",
    status: RunStatus.COMPLETED,
    currentStep: 2,
    stepResults: [{}, {}],
    createdAt: new Date("2026-07-19T10:00:00Z"),
    updatedAt: new Date("2026-07-19T10:01:00Z"),
  };

  it("фильтрует по userId и отдаёт лёгкую проекцию с названием сценария", async () => {
    const { service, runModel, query } = buildListService(
      [RUN_DOC],
      [{ _id: { toString: () => "sc1" }, title: "Проверка ИНН", steps: [{}, {}] }],
    );

    const page = await service.listRuns("u1", 1, 10);

    expect(runModel.find).toHaveBeenCalledWith({ userId: "u1" });
    // Тяжёлые поля не едут в список.
    expect(query.select).toHaveBeenCalledWith(
      "-stepResults.result -inputs -pendingInput -pageData -files -finalPage",
    );
    expect(page.data[0]).toMatchObject({
      id: "run-1",
      scenarioTitle: "Проверка ИНН",
      status: RunStatus.COMPLETED,
      totalSteps: 2,
    });
  });

  it("фильтр статусов уходит в $in, у удалённого сценария — плейсхолдер", async () => {
    const { service, runModel } = buildListService([RUN_DOC], []);

    const page = await service.listRuns("u1", 1, 10, [RunStatus.COMPLETED]);

    expect(runModel.find).toHaveBeenCalledWith({
      userId: "u1",
      status: { $in: [RunStatus.COMPLETED] },
    });
    expect(page.data[0].scenarioTitle).toBe("Сценарий удалён");
  });
});
