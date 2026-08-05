import { describe, it, expect } from "vitest";
import { distinctProviderAppIds, redactScenarioAuth } from "../src/types";
import type { ApiStep, PeriodicStep, ScenarioAuthEntry, Step } from "../src/types";

function apiStep(appId: string): ApiStep {
  return { id: `s-${appId}`, title: "Step", type: "api", appId, endpointId: "e1", method: "GET", path: "/" };
}

function periodicStep(appId: string): PeriodicStep {
  return {
    id: `p-${appId}`,
    title: "Poll",
    type: "periodic",
    appId,
    pollMethod: "GET",
    pollPath: "/status",
    pollIntervalSec: 5,
  };
}

describe("distinctProviderAppIds", () => {
  it("collects unique appId from api and periodic steps, in order of first appearance", () => {
    const steps: Step[] = [apiStep("a1"), periodicStep("a2"), apiStep("a1"), { id: "d1", title: "Wait", type: "delay", seconds: 1 }];

    expect(distinctProviderAppIds(steps)).toEqual(["a1", "a2"]);
  });

  it("returns an empty list when there are no api/periodic steps", () => {
    const steps: Step[] = [{ id: "d1", title: "Wait", type: "delay", seconds: 1 }];
    expect(distinctProviderAppIds(steps)).toEqual([]);
  });
});

describe("redactScenarioAuth", () => {
  const entries: ScenarioAuthEntry[] = [
    { appId: "a1", headerName: "Authorization", valueFormat: "bearer", value: "secret-token" },
    { appId: "a2", headerName: "X-Api-Key", valueFormat: "raw", value: "" },
  ];

  it("returns the full entries (with value) for the owner", () => {
    expect(redactScenarioAuth(entries, "owner-1", "owner-1")).toBe(entries);
  });

  it("strips `value` and adds `configured` for a non-owner viewer", () => {
    const result = redactScenarioAuth(entries, "owner-1", "someone-else");

    expect(result).toEqual([
      { appId: "a1", headerName: "Authorization", valueFormat: "bearer", configured: true },
      { appId: "a2", headerName: "X-Api-Key", valueFormat: "raw", configured: false },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("redacts for an anonymous viewer (undefined viewerUserId)", () => {
    const result = redactScenarioAuth(entries, "owner-1", undefined);
    expect(result?.every((e) => !("value" in e))).toBe(true);
  });

  it("passes through undefined authConfig unchanged", () => {
    expect(redactScenarioAuth(undefined, "owner-1", "owner-1")).toBeUndefined();
    expect(redactScenarioAuth(undefined, "owner-1", "someone-else")).toBeUndefined();
  });

  it("carries environmentId through redaction for a non-owner viewer", () => {
    const perEnv: ScenarioAuthEntry[] = [
      { appId: "a1", environmentId: "env-prod", headerName: "Authorization", valueFormat: "bearer", value: "prod-token" },
      { appId: "a1", environmentId: "env-test", headerName: "Authorization", valueFormat: "bearer", value: "" },
    ];

    const result = redactScenarioAuth(perEnv, "owner-1", "someone-else");

    expect(result).toEqual([
      { appId: "a1", environmentId: "env-prod", headerName: "Authorization", valueFormat: "bearer", configured: true },
      { appId: "a1", environmentId: "env-test", headerName: "Authorization", valueFormat: "bearer", configured: false },
    ]);
  });
});
