import { describe, it, expect } from "vitest";
import { detectCycle, buildDependencyGraph } from "../src/scenarios/cycle-guard";

describe("Cycle Guard", () => {
  it("builds dependency graph correctly", () => {
    const scenarios = [
      { id: "s1", steps: [{ type: "scenario", refScenarioId: "s2" }] },
      { id: "s2", steps: [{ type: "scenario", refScenarioId: "s3" }] },
      { id: "s3", steps: [{ type: "api", method: "GET", path: "/test" }] },
    ];
    const graph = buildDependencyGraph(scenarios as any);
    expect(graph.get("s1")).toEqual(["s2"]);
    expect(graph.get("s2")).toEqual(["s3"]);
    expect(graph.get("s3") ?? []).toEqual([]);
  });

  it("detects direct cycle (s1 → s2 → s1)", () => {
    const scenarios = [
      { id: "s1", steps: [{ type: "scenario", refScenarioId: "s2" }] },
      { id: "s2", steps: [{ type: "scenario", refScenarioId: "s1" }] },
    ];
    expect(detectCycle("s1", scenarios as any)).toBe(true);
  });

  it("detects indirect cycle (s1 → s2 → s3 → s1)", () => {
    const scenarios = [
      { id: "s1", steps: [{ type: "scenario", refScenarioId: "s2" }] },
      { id: "s2", steps: [{ type: "scenario", refScenarioId: "s3" }] },
      { id: "s3", steps: [{ type: "scenario", refScenarioId: "s1" }] },
    ];
    expect(detectCycle("s1", scenarios as any)).toBe(true);
  });

  it("returns false for acyclic graph", () => {
    const scenarios = [
      { id: "s1", steps: [{ type: "scenario", refScenarioId: "s2" }] },
      { id: "s2", steps: [{ type: "scenario", refScenarioId: "s3" }] },
      { id: "s3", steps: [{ type: "api" }] },
    ];
    expect(detectCycle("s1", scenarios as any)).toBe(false);
  });

  it("returns false for self-referencing scenario (caught separately)", () => {
    const scenarios = [
      { id: "s1", steps: [{ type: "scenario", refScenarioId: "s1" }] },
    ];
    expect(detectCycle("s1", scenarios as any)).toBe(true);
  });

  it("handles scenarios with no steps", () => {
    const scenarios = [{ id: "s1", steps: [] }];
    expect(detectCycle("s1", scenarios as any)).toBe(false);
  });
});
