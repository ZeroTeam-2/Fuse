import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type {
  ApiStep,
  PaginatedResponse,
  SchemaField,
  ScenarioStepRef,
  Step,
  StepSchema,
} from "@fuse/shared";
import { Scenario, ScenarioDocument } from "./scenario.schema";
import { detectCycle } from "./cycle-guard";
import { AppsService } from "../apps/apps.service";
import { ExecutionService } from "../execution/execution.service";
import type { CreateScenarioDto } from "./dto/create-scenario.dto";
import type { UpdateScenarioDto } from "./dto/update-scenario.dto";

const EMPTY_SCHEMA: StepSchema = {
  inputs: [] as SchemaField[],
  outputs: [] as SchemaField[],
  outputIsArray: false,
};

@Injectable()
export class ScenariosService {
  constructor(
    @InjectModel(Scenario.name) private readonly scenarioModel: Model<ScenarioDocument>,
    private readonly appsService: AppsService,
    private readonly executionService: ExecutionService,
  ) {}

  async findByOwner(
    ownerId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<ScenarioDocument>> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.scenarioModel
        .find({ ownerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.scenarioModel.countDocuments({ ownerId }).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async findById(id: string, ownerId?: string): Promise<ScenarioDocument> {
    const filter = ownerId ? { _id: id, ownerId } : { _id: id };
    const scenario = await this.scenarioModel.findOne(filter).exec();
    if (!scenario) {
      throw new NotFoundException(`Scenario #${id} not found`);
    }
    return scenario;
  }

  async create(
    ownerId: string,
    dto: CreateScenarioDto,
  ): Promise<ScenarioDocument> {
    return new this.scenarioModel({
      ownerId,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      subcategory: dto.subcategory,
      steps: [],
      published: false,
      runCount: 0,
    }).save();
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateScenarioDto,
  ): Promise<ScenarioDocument> {
    const scenario = await this.findById(id, ownerId);

    if (dto.steps) {
      const refSteps = (dto.steps as Step[]).filter(
        (s): s is ScenarioStepRef => s.type === "scenario",
      );

      if (refSteps.length > 0) {
        const referencedIds = [...new Set(refSteps.map((s) => s.refScenarioId))];
        const referencedScenarios = await this.scenarioModel
          .find({ _id: { $in: referencedIds } })
          .select("_id steps")
          .lean()
          .exec();

        const allEntries = [
          { id: scenario._id.toString(), steps: dto.steps as Step[] },
          ...referencedScenarios.map((s) => ({
            id: s._id.toString(),
            steps: (s.steps ?? []) as Step[],
          })),
        ];

        if (detectCycle(scenario._id.toString(), allEntries)) {
          throw new BadRequestException(
            "Circular scenario reference detected",
          );
        }
      }
    }

    const updateQuery: Record<string, unknown> = { $set: { ...dto } };

    // Разблокировка сценария живёт здесь же: как только пользователь убирает
    // (или пересобирает) шаг с `broken: true`, следующее сохранение шагов
    // само снимает блокировку — отдельная ручка "разблокировать" не нужна.
    if (dto.steps) {
      const stillBroken = (dto.steps as Step[]).some(
        (s) => (s as { broken?: boolean }).broken === true,
      );
      (updateQuery.$set as Record<string, unknown>).blocked = stillBroken;
      if (!stillBroken) {
        updateQuery.$unset = { blockedReason: "" };
      }
    }

    const updated = await this.scenarioModel
      .findOneAndUpdate({ _id: id, ownerId }, updateQuery, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Scenario #${id} not found`);
    }
    return updated;
  }

  async togglePublish(id: string, ownerId: string): Promise<ScenarioDocument> {
    const scenario = await this.findById(id, ownerId);

    if (!scenario.published && scenario.steps.length === 0) {
      throw new BadRequestException(
        "Cannot publish a scenario with no steps",
      );
    }

    if (!scenario.published && scenario.blocked) {
      throw new BadRequestException(
        scenario.blockedReason ??
          "Cannot publish a blocked scenario — fix the broken step first",
      );
    }

    const updated = await this.scenarioModel
      .findOneAndUpdate(
        { _id: id, ownerId },
        { $set: { published: !scenario.published } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Scenario #${id} not found`);
    }
    return updated;
  }

  async delete(id: string, ownerId: string): Promise<ScenarioDocument> {
    // Проверяем владение перед отменой ранов и удалением
    await this.findById(id, ownerId);

    // Уже запущенные `Run`ы этого сценария иначе продолжат исполняться в
    // воркере даже после удаления самого сценария — их нужно остановить
    // до (а не после) удаления, чтобы не проверять статус гонкой.
    await this.executionService.cancelActiveRunsForScenarios([id]);

    const deleted = await this.scenarioModel
      .findOneAndDelete({ _id: id, ownerId })
      .exec();
    if (!deleted) {
      throw new NotFoundException(`Scenario #${id} not found`);
    }
    return deleted;
  }

  async incrementRunCount(id: string): Promise<void> {
    await this.scenarioModel
      .updateOne({ _id: id }, { $inc: { runCount: 1 } })
      .exec();
  }

  async getStepSchema(
    scenarioId: string,
    stepIndex: number,
    ownerId?: string,
  ): Promise<StepSchema> {
    const scenario = await this.findById(scenarioId, ownerId);

    const steps = (scenario.steps ?? []) as Step[];

    if (stepIndex < 0 || stepIndex >= steps.length) {
      throw new NotFoundException(
        `Step #${stepIndex} not found in scenario #${scenarioId}`,
      );
    }

    const step = steps[stepIndex];

    switch (step.type) {
      case "api":
        return this.getApiStepSchema(step);

      case "scenario":
        return this.getScenarioRefStepSchema(step);

      default:
        return EMPTY_SCHEMA;
    }
  }

  async getUpstreamSchemas(
    scenarioId: string,
    stepIndex: number,
  ): Promise<SchemaField[]> {
    const scenario = await this.findById(scenarioId);
    const steps = (scenario.steps ?? []) as Step[];

    const outputs: SchemaField[] = [];

    for (let i = 0; i < stepIndex && i < steps.length; i++) {
      const schema = await this.getStepSchema(scenarioId, i);
      outputs.push(...schema.outputs);
    }

    return outputs;
  }

  private async getApiStepSchema(step: ApiStep): Promise<StepSchema> {
    const app = await this.appsService.findById(step.appId);
    const endpoint = app.endpoints.find((ep) => ep.id === step.endpointId);

    if (!endpoint) {
      throw new NotFoundException(
        `Endpoint #${step.endpointId} not found in app #${step.appId}`,
      );
    }

    return {
      inputs: endpoint.inputs as unknown as SchemaField[],
      outputs: endpoint.outputs as unknown as SchemaField[],
      outputIsArray: endpoint.outputIsArray ?? false,
    };
  }

  private async getScenarioRefStepSchema(step: ScenarioStepRef): Promise<StepSchema> {
    const refScenario = await this.findById(step.refScenarioId);
    const steps = (refScenario.steps ?? []) as Step[];

    if (steps.length === 0) {
      return EMPTY_SCHEMA;
    }

    // A nested scenario hands on its last step's result — collection flag included.
    const lastStep = steps[steps.length - 1];
    const lastSchema = await this.getStepSchemaForStep(lastStep);

    return {
      inputs: [],
      outputs: lastSchema.outputs,
      outputIsArray: lastSchema.outputIsArray ?? false,
    };
  }

  private async getStepSchemaForStep(step: Step): Promise<StepSchema> {
    switch (step.type) {
      case "api":
        return this.getApiStepSchema(step);

      case "scenario":
        return this.getScenarioRefStepSchema(step);

      default:
        return EMPTY_SCHEMA;
    }
  }
}
