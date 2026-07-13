import { describe, it, expect, vi } from "vitest";
import type { Step } from "@fuse/shared";

vi.mock("../src/scenarios/scenario.schema", () => ({
  Scenario: { name: "Scenario" },
  ScenarioSchema: {},
  ScenarioDocument: {},
}));
vi.mock("../src/apps/app.schema", () => ({
  App: { name: "App" },
  AppSchema: {},
  AppDocument: {},
}));

import { ManualInputsService } from "../src/execution/manual-inputs.service";

function modelOf(byId: Record<string, unknown>) {
  return {
    findById: vi.fn((id: string) => ({
      exec: vi.fn().mockResolvedValue(byId[id] ?? null),
    })),
  } as any;
}

const ENDPOINT = {
  id: "e1",
  method: "GET",
  path: "/orgs",
  inputs: [{ key: "inn", label: "ИНН организации", type: "string", required: true }],
  outputs: [],
};

const STEPS: Step[] = [
  {
    id: "s1",
    title: "Организации",
    type: "api",
    appId: "a1",
    endpointId: "e1",
    method: "GET",
    path: "/orgs",
    mappings: { inn: "user" },
  } as Step,
];

describe("ManualInputsService", () => {
  it("describes manual values of a scenario using the endpoint schema", async () => {
    const service = new ManualInputsService(
      modelOf({ sc1: { steps: STEPS } }),
      modelOf({ a1: { endpoints: [ENDPOINT] } }),
    );

    const result = await service.forScenario("sc1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: "s0:inn",
      paramKey: "inn",
      kind: "param",
      label: "ИНН организации",
      required: true,
      source: "form",
    });
  });

  it("returns an empty list for a scenario without manual values", async () => {
    const steps: Step[] = [
      { ...(STEPS[0] as object), mappings: { inn: "const" }, consts: { inn: "77" } } as Step,
    ];

    const service = new ManualInputsService(
      modelOf({ sc1: { steps } }),
      modelOf({ a1: { endpoints: [ENDPOINT] } }),
    );

    expect(await service.forScenario("sc1")).toEqual([]);
  });

  it("still asks for the value when the step's app is gone", async () => {
    const service = new ManualInputsService(
      modelOf({ sc1: { steps: STEPS } }),
      modelOf({}),
    );

    const result = await service.forScenario("sc1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "s0:inn", label: "inn", required: false });
  });
});
