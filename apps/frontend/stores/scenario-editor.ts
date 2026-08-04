import { defineStore } from "pinia";
import { distinctProviderAppIds } from "@fuse/shared";
import type { EnvironmentSelection, ScenarioAuthEntry, Step } from "@fuse/shared";

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
      authConfig?: ScenarioAuthEntry[];
      blocked?: boolean;
      blockedReason?: string;
    },
    selectedStepIndex: null as number | null,
    saving: false,
  }),

  getters: {
    stepCount: (state) => state.scenario?.steps.length ?? 0,
    // Providers used by endpoint-bearing steps, in first-appearance order.
    distinctAppIds: (state): string[] => distinctProviderAppIds(state.scenario?.steps ?? []),
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

    // Ключ уникален по паре (appId, environmentId) — один и тот же поставщик
    // может иметь разные ключи для разных окружений (Prod/Test/…). Запись без
    // environmentId (легаси/общий ключ) матчится отдельно от записей с ним.
    setAuthConfig(entry: ScenarioAuthEntry) {
      if (!this.scenario) return;
      const list = this.scenario.authConfig ?? [];
      const existing = list.find(
        (e) => e.appId === entry.appId && e.environmentId === entry.environmentId,
      );
      if (existing) Object.assign(existing, entry);
      else list.push(entry);
      this.scenario.authConfig = list;
    },

    // When a key is saved for a provider, reset authEnabled to undefined for all
    // matching steps. undefined means "inject if a key is configured" — the worker
    // only skips injection when authEnabled is explicitly false (user opted out).
    // This handles both new steps (never had a key) and existing steps whose
    // authEnabled: false was just a default, not an intentional opt-out.
    enableAuthForProvider(appId: string) {
      if (!this.scenario) return;
      for (const step of this.scenario.steps) {
        if ((step.type === "api" || step.type === "periodic") && step.appId === appId) {
          (step as { authEnabled?: boolean }).authEnabled = undefined;
        }
      }
    },

    // Mirrors pruneEnvironmentSelections: a provider dropped with its last step
    // loses its stale key too.
    pruneAuthConfig() {
      if (!this.scenario?.authConfig) return;
      const valid = this.distinctAppIds;
      this.scenario.authConfig = this.scenario.authConfig.filter((e) => valid.includes(e.appId));
    },
  },
});
