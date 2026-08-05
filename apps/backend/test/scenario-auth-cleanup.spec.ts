import { describe, it, expect, vi } from "vitest";
import type { Step } from "@fuse/shared";

vi.mock("../src/scenarios/scenario.schema", () => ({
  Scenario: { name: "Scenario" },
  ScenarioSchema: {},
  ScenarioDocument: {},
}));

import { ScenariosService } from "../src/scenarios/scenarios.service";

const API_STEP_A1: Step = {
  id: "s1",
  title: "A1 step",
  type: "api",
  appId: "a1",
  endpointId: "e1",
  method: "GET",
  path: "/orgs",
} as Step;

function buildModel(scenario: Record<string, unknown>) {
  const findOneAndUpdate = vi.fn().mockImplementation((_filter, update) => ({
    exec: vi.fn().mockResolvedValue({ ...scenario, ...update.$set }),
  }));

  const model: any = {
    findOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(scenario) }),
    findOneAndUpdate,
  };
  return model;
}

function buildService(scenario: Record<string, unknown>) {
  const model = buildModel(scenario);
  const service = new ScenariosService(model, {} as any, {} as any);
  return { service, model };
}

describe("ScenariosService.update — orphan cleanup for authConfig/environmentSelections", () => {
  it("drops authConfig entries whose provider no longer has a step, on a steps-only save", async () => {
    const scenario = {
      _id: "sc1",
      ownerId: "owner-1",
      steps: [API_STEP_A1, { id: "s2", title: "A2 step", type: "api", appId: "a2", endpointId: "e2", method: "GET", path: "/x" }],
      authConfig: [
        { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-1" },
        { appId: "a2", headerName: "X-Api-Key", valueFormat: "raw", value: "tok-2" },
      ],
      environmentSelections: [
        { appId: "a1", environmentId: "env-1" },
        { appId: "a2", environmentId: "env-2" },
      ],
    };
    const { service, model } = buildService(scenario);

    // Only A1 remains in the new steps — A2's auth key and env selection are orphaned.
    await service.update("sc1", "owner-1", { steps: [API_STEP_A1] });

    const setArg = model.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.authConfig).toEqual([
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-1" },
    ]);
    expect(setArg.environmentSelections).toEqual([{ appId: "a1", environmentId: "env-1" }]);
  });

  it("prunes an authConfig-only save against the scenario's current steps", async () => {
    const scenario = {
      _id: "sc1",
      ownerId: "owner-1",
      steps: [API_STEP_A1],
      authConfig: [],
      environmentSelections: [],
    };
    const { service, model } = buildService(scenario);

    // Client (or a stale save) sends a key for a provider not in any step.
    await service.update("sc1", "owner-1", {
      authConfig: [
        { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-1" },
        { appId: "gone", headerName: "X-Api-Key", valueFormat: "raw", value: "tok-x" },
      ],
    });

    const setArg = model.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.authConfig).toEqual([
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-1" },
    ]);
  });

  it("keeps authConfig untouched when neither steps nor authConfig/environmentSelections change", async () => {
    const scenario = {
      _id: "sc1",
      ownerId: "owner-1",
      steps: [API_STEP_A1],
      authConfig: [{ appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "tok-1" }],
      environmentSelections: [],
    };
    const { service, model } = buildService(scenario);

    await service.update("sc1", "owner-1", { title: "Renamed" });

    const setArg = model.findOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.authConfig).toBeUndefined();
    expect(setArg.title).toBe("Renamed");
  });
});
