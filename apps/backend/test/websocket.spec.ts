import { describe, it, expect, vi } from "vitest";
import { RunStatus } from "@fuse/shared";

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

import { RunGateway } from "../src/websocket/run.gateway";

function mockQuery<T>(value: T) {
  return { exec: () => Promise.resolve(value) } as any;
}

function makeGateway(run: unknown) {
  const runModel = { findById: vi.fn(() => mockQuery(run)) };
  return new RunGateway(runModel as any);
}

function makeClient(runId?: string) {
  return {
    id: "socket-1",
    handshake: { query: runId ? { runId } : {} },
    join: vi.fn(),
    emit: vi.fn(),
  } as any;
}

describe("RunGateway", () => {
  it("is instantiable", () => {
    const gateway = makeGateway(null);
    expect(gateway).toBeDefined();
    expect(typeof gateway.emitToRun).toBe("function");
  });

  it("joins the run room on connect", async () => {
    const gateway = makeGateway(null);
    const client = makeClient("run-1");

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith("run:run-1");
  });

  it("sends a snapshot of a run that already failed before the client connected", async () => {
    // Это и есть корень «сценарий стартует, но на выходе пусто»: запуск падал
    // за миллисекунды, run:error улетал в пустую комнату, и UI висел вечно.
    const gateway = makeGateway({
      status: RunStatus.FAILED,
      currentStep: 0,
      error: "У приложения «Fake Dadata» не задан базовый URL",
      stepResults: [
        { stepIndex: 0, stepTitle: "Получить список организаций", status: "failed" },
      ],
    });
    const client = makeClient("run-1");

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith(
      "run:status",
      expect.objectContaining({
        type: "run:status",
        runId: "run-1",
        payload: expect.objectContaining({
          status: RunStatus.FAILED,
          error: "У приложения «Fake Dadata» не задан базовый URL",
          stepResults: [
            expect.objectContaining({ stepIndex: 0, status: "failed" }),
          ],
        }),
      }),
    );
  });

  it("sends a snapshot of a completed run with its step results", async () => {
    const gateway = makeGateway({
      status: RunStatus.COMPLETED,
      currentStep: 1,
      stepResults: [
        {
          stepIndex: 0,
          stepTitle: "Получить список организаций",
          status: "completed",
          result: [{ name: "ООО Ромашка" }],
          durationMs: 120,
        },
      ],
    });
    const client = makeClient("run-1");

    await gateway.handleConnection(client);

    const [, event] = client.emit.mock.calls[0];
    expect(event.payload.status).toBe(RunStatus.COMPLETED);
    expect(event.payload.stepResults[0].result).toEqual([{ name: "ООО Ромашка" }]);
  });

  it("does not join or snapshot when no runId is supplied", async () => {
    const gateway = makeGateway(null);
    const client = makeClient();

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalled();
  });
});
