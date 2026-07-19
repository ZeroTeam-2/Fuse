import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { ManualInputDescriptor, Step, StepSchema } from "@fuse/shared";
import { pageStepSchema } from "@fuse/shared";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";
import { App, AppDocument } from "../apps/app.schema";
import { enumerateManualInputs, type ManualInputDeps } from "./manual-inputs";

/**
 * Модели читаются напрямую, а не через `ScenariosService`/`AppsService`:
 * `ScenariosModule` и `AppsModule` уже импортируют `ExecutionModule`, так что
 * обратная зависимость замкнула бы модули в цикл. Тот же приём, что у воркера.
 */
@Injectable()
export class ManualInputsService {
  constructor(
    @InjectModel(Scenario.name)
    private readonly scenarioModel: Model<ScenarioDocument>,
    @InjectModel(App.name) private readonly appModel: Model<AppDocument>,
  ) {}

  async forScenario(scenarioId: string): Promise<ManualInputDescriptor[]> {
    const steps = await this.loadSteps(scenarioId);
    return enumerateManualInputs(steps, this.deps(), scenarioId);
  }

  async forSteps(steps: Step[], scenarioId?: string): Promise<ManualInputDescriptor[]> {
    return enumerateManualInputs(steps, this.deps(), scenarioId);
  }

  private deps(): ManualInputDeps {
    return {
      loadSteps: (scenarioId) => this.loadSteps(scenarioId),
      loadStepSchema: (step) => this.loadStepSchema(step),
    };
  }

  private async loadSteps(scenarioId: string): Promise<Step[]> {
    const scenario = await this.scenarioModel.findById(scenarioId).exec();
    return ((scenario?.steps ?? []) as Step[]) ?? [];
  }

  private async loadStepSchema(step: Step): Promise<StepSchema | null> {
    if (step.type === "api") {
      const app = await this.appModel.findById(step.appId).exec();
      const endpoint = app?.endpoints?.find((ep) => ep.id === step.endpointId);
      if (!endpoint) return null;

      return {
        inputs: endpoint.inputs as unknown as StepSchema["inputs"],
        outputs: endpoint.outputs as unknown as StepSchema["outputs"],
        outputIsArray: endpoint.outputIsArray ?? false,
      };
    }

    // Выходы шага-страницы — его блоки ввода: по ним следующие шаги строят
    // маппинг «Из шага» (в т.ч. когда страница — последний шаг вложенного
    // сценария и отдаёт его результат наружу).
    if (step.type === "page") {
      return pageStepSchema(step.page);
    }

    // Вложенный сценарий отдаёт наружу результат своего последнего шага —
    // как и в `ScenariosService.getStepSchema`.
    if (step.type === "scenario") {
      const nested = await this.loadSteps(step.refScenarioId);
      const last = nested[nested.length - 1];
      if (!last || last.type === "scenario") return null;

      const schema = await this.loadStepSchema(last);
      if (!schema) return null;

      return { inputs: [], outputs: schema.outputs, outputIsArray: schema.outputIsArray };
    }

    return { inputs: [], outputs: [], outputIsArray: false };
  }
}
