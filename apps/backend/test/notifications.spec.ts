import { describe, it, expect, vi } from "vitest";
import { RunStatus } from "@fuse/shared";

vi.mock("../src/notifications/notification.schema", () => ({
  Notification: { name: "Notification" },
  NotificationSchema: {},
}));
vi.mock("../src/notifications/notifications.gateway", () => ({
  NotificationsGateway: class {},
}));
vi.mock("../src/execution/run.schema", () => ({
  Run: { name: "Run" },
  RunSchema: {},
}));
vi.mock("../src/scenarios/scenario.schema", () => ({
  Scenario: { name: "Scenario" },
  ScenarioSchema: {},
}));

import { NotificationsService } from "../src/notifications/notifications.service";

const RUN = { _id: "run-1", userId: "u1", scenarioId: "sc1", status: RunStatus.COMPLETED };

function build(overrides: {
  create?: ReturnType<typeof vi.fn>;
  scenario?: Record<string, unknown> | null;
}) {
  const exec = (value: unknown) => ({ exec: vi.fn().mockResolvedValue(value) });
  const doc = {
    _id: { toString: () => "n1" },
    userId: "u1",
    runId: "run-1",
    scenarioId: "sc1",
    scenarioTitle: "Сценарий",
    type: "run_completed",
    read: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const notificationModel: any = {
    create: overrides.create ?? vi.fn().mockResolvedValue(doc),
    countDocuments: vi.fn().mockReturnValue(exec(1)),
  };
  const runModel: any = { findById: vi.fn().mockReturnValue(exec(RUN)) };
  const scenarioModel: any = {
    findById: vi.fn().mockReturnValue(
      exec("scenario" in overrides ? overrides.scenario : { title: "Сценарий" }),
    ),
  };
  const gateway = { emitNew: vi.fn() };
  const service = new NotificationsService(
    notificationModel,
    runModel,
    scenarioModel,
    gateway as any,
  );
  return { service, notificationModel, gateway };
}

describe("NotificationsService.notifyRunEvent", () => {
  it("создаёт уведомление и эмитит его в комнату пользователя", async () => {
    const { service, notificationModel, gateway } = build({});

    await service.notifyRunEvent("run-1", "run_completed");

    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        runId: "run-1",
        type: "run_completed",
        scenarioTitle: "Сценарий",
        read: false,
      }),
    );
    expect(gateway.emitNew).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ unreadCount: 1 }),
    );
  });

  it("повторная доставка (duplicate key) молча гасится и не эмитится", async () => {
    const dup = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    const { service, gateway } = build({ create: vi.fn().mockRejectedValue(dup) });

    await expect(service.notifyRunEvent("run-1", "run_completed")).resolves.toBeUndefined();
    expect(gateway.emitNew).not.toHaveBeenCalled();
  });

  it("любая другая ошибка не роняет вызывающего (запуск важнее уведомления)", async () => {
    const { service } = build({ create: vi.fn().mockRejectedValue(new Error("mongo down")) });

    await expect(service.notifyRunEvent("run-1", "run_failed")).resolves.toBeUndefined();
  });

  it("удалённый сценарий получает плейсхолдер в заголовке", async () => {
    const { service, notificationModel } = build({ scenario: null });

    await service.notifyRunEvent("run-1", "run_completed");

    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioTitle: "Сценарий удалён" }),
    );
  });

  it("stepIndex попадает в документ для waiting_input", async () => {
    const { service, notificationModel } = build({});

    await service.notifyRunEvent("run-1", "run_waiting_input", 3);

    expect(notificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "run_waiting_input", stepIndex: 3 }),
    );
  });
});
