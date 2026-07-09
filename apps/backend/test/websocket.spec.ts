import { describe, it, expect } from "vitest";
import { RunGateway } from "../src/websocket/run.gateway";

describe("RunGateway", () => {
  it("should be instantiable", () => {
    const gateway = new RunGateway();
    expect(gateway).toBeDefined();
    expect(gateway.server).toBeUndefined();
  });

  it("emitToRun is a method", () => {
    const gateway = new RunGateway();
    expect(typeof gateway.emitToRun).toBe("function");
  });
});
