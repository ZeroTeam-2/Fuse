import { defineStore } from "pinia";
import type { Step } from "@fuse/shared";

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
      blocked?: boolean;
      blockedReason?: string;
    },
    selectedStepIndex: null as number | null,
    saving: false,
  }),

  getters: {
    stepCount: (state) => state.scenario?.steps.length ?? 0,
    distinctAppCount: (state) => {
      if (!state.scenario) return 0;
      const appIds = new Set<string>();
      for (const step of state.scenario.steps) {
        if (step.type === "api" && step.appId) appIds.add(step.appId);
        if (step.type === "periodic" && step.appId) appIds.add(step.appId);
      }
      return appIds.size;
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
  },
});
