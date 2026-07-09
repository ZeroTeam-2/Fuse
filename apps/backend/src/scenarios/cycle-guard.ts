import type { Step } from "@fuse/shared";

interface ScenarioGraphEntry {
  id: string;
  steps: Step[];
}

export function buildDependencyGraph(
  scenarios: ScenarioGraphEntry[],
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const scenario of scenarios) {
    const deps: string[] = [];
    for (const step of scenario.steps) {
      if (step.type === "scenario") {
        deps.push(step.refScenarioId);
      }
    }
    graph.set(scenario.id, deps);
  }

  return graph;
}

export function detectCycle(
  scenarioId: string,
  scenarios: ScenarioGraphEntry[],
): boolean {
  const graph = buildDependencyGraph(scenarios);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();

  for (const scenario of scenarios) {
    color.set(scenario.id, WHITE);
  }
  color.set(scenarioId, WHITE);

  const dfs = (nodeId: string): boolean => {
    color.set(nodeId, GRAY);

    const neighbors = graph.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor) ?? WHITE;

      if (neighborColor === GRAY) {
        return true;
      }

      if (neighborColor === WHITE && dfs(neighbor)) {
        return true;
      }
    }

    color.set(nodeId, BLACK);
    return false;
  };

  return dfs(scenarioId);
}
