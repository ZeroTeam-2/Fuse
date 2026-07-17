import { defineStore } from "pinia";
import type { EnvironmentSelection, Step } from "@fuse/shared";

export const useScenarioEditorStore = defineStore("scenarioEditor", {
  state: () => ({
    scenario: null as null | {
      id: string;
      title: string;
      description?: string;
      category?: string;
      subcategory?: string;
      published: boolean;
      steps: Step[];
      environmentSelections?: EnvironmentSelection[];
      blocked?: boolean;
      blockedReason?: string;
    },
    selectedStepIndex: null as number | null,
    saving: false,
  }),

  getters: {
    stepCount: (state) => state.scenario?.steps.length ?? 0,
    // Providers used by endpoint-bearing steps, in first-appearance order.
    distinctAppIds: (state): string[] => {
      const ids: string[] = [];
      for (const step of state.scenario?.steps ?? []) {
        if (
          (step.type === "api" || step.type === "periodic") &&
          step.appId &&
          !ids.includes(step.appId)
        ) {
          ids.push(step.appId);
        }
      }
      return ids;
    },
    distinctAppCount(): number {
      return this.distinctAppIds.length;
    },
  },

  actions: {
    setScenario(data: any) {
      this.scenario = { ...data, steps: data.steps ?? [] };
    },

    addStep(step: Step) {
      this.scenario?.steps.push(step);
    },

    updateStep(index: number, step: Step) {
      if (this.scenario && index >= 0 && index < this.scenario.steps.length) {
        this.scenario.steps[index] = step;
      }
    },

    removeStep(index: number) {
      this.scenario?.steps.splice(index, 1);
      if (this.selectedStepIndex === index) {
        this.selectedStepIndex = null;
      }
    },

    moveStep(from: number, to: number) {
      if (!this.scenario) return;
      const steps = this.scenario.steps;
      if (from < 0 || from >= steps.length || to < 0 || to >= steps.length) return;
      const [removed] = steps.splice(from, 1);
      steps.splice(to, 0, removed);
    },

    selectStep(index: number | null) {
      this.selectedStepIndex = index;
    },

    setEnvironmentSelection(appId: string, environmentId: string) {
      if (!this.scenario) return;
      const list = this.scenario.environmentSelections ?? [];
      const existing = list.find((s) => s.appId === appId);
      if (existing) existing.environmentId = environmentId;
      else list.push({ appId, environmentId });
      this.scenario.environmentSelections = list;
    },

    // Providers may be removed with their last step — drop their stale choices.
    pruneEnvironmentSelections() {
      if (!this.scenario?.environmentSelections) return;
      const valid = this.distinctAppIds;
      this.scenario.environmentSelections = this.scenario.environmentSelections.filter(
        (s) => valid.includes(s.appId),
      );
    },
  },
});
