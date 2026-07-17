import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { EndpointStatus } from "@fuse/shared";
import type {
  Endpoint,
  ImportPreviewResult,
  PaginatedResponse,
  ReimportDiff,
  Step,
} from "@fuse/shared";
import { App, AppDocument } from "./app.schema";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";
import { OpenApiParserService } from "./openapi-parser";
import { SsrfGuard } from "./ssrf-guard";
import { parseSpecText } from "./spec-text-parser";
import { ExecutionService } from "../execution/execution.service";
import type { CreateAppDto } from "./dto/create-app.dto";
import type { ImportPreviewDto } from "./dto/import-preview.dto";
import type { UpdateAppDto } from "./dto/update-app.dto";

type EndpointSummary = Pick<Endpoint, "method" | "path" | "summary">;

function endpointKey(ep: { method: string; path: string }): string {
  return `${ep.method}:${ep.path}`;
}

function toSummary(ep: Endpoint): EndpointSummary {
  return { method: ep.method, path: ep.path, summary: ep.summary };
}

@Injectable()
export class AppsService {
  constructor(
    @InjectModel(App.name) private readonly appModel: Model<AppDocument>,
    @InjectModel(Scenario.name)
    private readonly scenarioModel: Model<ScenarioDocument>,
    private readonly openapiParser: OpenApiParserService,
    private readonly ssrfGuard: SsrfGuard,
    private readonly executionService: ExecutionService,
  ) {}

  async findByOwner(
    ownerId: string,
    page = 1,
    limit = 20,
    onlyPublished = false,
  ): Promise<PaginatedResponse<AppDocument>> {
    const skip = (page - 1) * limit;
    // Pickers that build on other apps (e.g. add-step app select) must only
    // ever see published apps, from any owner, and never unpublished ones —
    // including the caller's own drafts.
    const filter = onlyPublished ? { published: true } : { ownerId };
    const [data, total] = await Promise.all([
      this.appModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.appModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async findById(id: string, ownerId?: string): Promise<AppDocument> {
    const filter = ownerId ? { _id: id, ownerId } : { _id: id };
    const app = await this.appModel.findOne(filter).exec();
    if (!app) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return app;
  }

  async create(ownerId: string, dto: CreateAppDto): Promise<AppDocument> {
    const rawSpec = await this.ssrfGuard.fetchSpec(dto.openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec, dto.openapiUrl);

    return new this.appModel({
      ownerId,
      name: dto.name,
      description: dto.description,
      openapiUrl: dto.openapiUrl,
      baseUrl: parsed.baseUrl,
      host: parsed.host,
      apiVersion: parsed.apiVersion,
      endpoints: parsed.endpoints,
      published: false,
      syncedAt: new Date(),
    }).save();
  }

  async importPreview(dto: ImportPreviewDto): Promise<ImportPreviewResult> {
    const rawSpec = await this.ssrfGuard.fetchSpec(dto.openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec, dto.openapiUrl);

    return {
      baseUrl: parsed.baseUrl,
      host: parsed.host,
      apiVersion: parsed.apiVersion,
      endpointCount: parsed.endpoints.length,
      endpoints: parsed.endpoints.map(toSummary),
    };
  }

  async importPreviewFile(
    specText: string,
    contentType: string,
    baseUrlOverride?: string,
  ): Promise<ImportPreviewResult> {
    const rawSpec = parseSpecText(specText, contentType);
    const parsed = await this.openapiParser.parse(rawSpec, "", {
      baseUrlOverride,
    });

    if (!parsed.baseUrl) {
      throw new BadRequestException(
        "Не удалось определить базовый URL API. Укажите его в поле «Базовый URL API».",
      );
    }

    return {
      baseUrl: parsed.baseUrl,
      host: parsed.host,
      apiVersion: parsed.apiVersion,
      endpointCount: parsed.endpoints.length,
      endpoints: parsed.endpoints.map(toSummary),
    };
  }

  async createFromFile(
    ownerId: string,
    params: {
      name: string;
      description?: string;
      specText: string;
      contentType: string;
      baseUrlOverride?: string;
    },
  ): Promise<AppDocument> {
    const rawSpec = parseSpecText(params.specText, params.contentType);
    const parsed = await this.openapiParser.parse(rawSpec, "", {
      baseUrlOverride: params.baseUrlOverride,
    });

    if (!parsed.baseUrl) {
      throw new BadRequestException(
        "Не удалось определить базовый URL API. Укажите его в поле «Базовый URL API».",
      );
    }

    return new this.appModel({
      ownerId,
      name: params.name,
      description: params.description,
      baseUrl: parsed.baseUrl,
      host: parsed.host,
      apiVersion: parsed.apiVersion,
      endpoints: parsed.endpoints,
      published: false,
      syncedAt: new Date(),
    }).save();
  }

  async reimport(id: string, ownerId: string): Promise<ReimportDiff> {
    const app = await this.findById(id, ownerId);
    const openapiUrl = this.requireOpenapiUrl(app);

    const rawSpec = await this.ssrfGuard.fetchSpec(openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec, openapiUrl);

    const oldKeys = new Set(app.endpoints.map(endpointKey));
    const newKeys = new Set(parsed.endpoints.map(endpointKey));

    const added: EndpointSummary[] = [];
    const kept: EndpointSummary[] = [];

    for (const ep of parsed.endpoints) {
      if (oldKeys.has(endpointKey(ep))) {
        kept.push(toSummary(ep));
      } else {
        added.push(toSummary(ep));
      }
    }

    const deprecated: EndpointSummary[] = app.endpoints
      .filter((ep) => !newKeys.has(endpointKey(ep)))
      .map(toSummary);

    return { added, deprecated, kept };
  }

  async applyReimport(id: string, ownerId: string): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);
    const openapiUrl = this.requireOpenapiUrl(app);

    const rawSpec = await this.ssrfGuard.fetchSpec(openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec, openapiUrl);

    const oldEndpoints = new Map<string, Endpoint>();
    for (const ep of app.endpoints) {
      oldEndpoints.set(endpointKey(ep), ep);
    }

    const newKeys = new Set(parsed.endpoints.map(endpointKey));

    const merged: Endpoint[] = parsed.endpoints.map((ep) => {
      const existing = oldEndpoints.get(endpointKey(ep));
      return {
        ...ep,
        id: existing?.id ?? ep.id,
        status: EndpointStatus.ACTIVE,
      };
    });

    for (const [key, ep] of oldEndpoints) {
      if (!newKeys.has(key)) {
        merged.push({ ...ep, status: EndpointStatus.DEPRECATED });
      }
    }

    const updated = await this.appModel
      .findOneAndUpdate(
        { _id: id, ownerId },
        {
          $set: {
            endpoints: merged,
            baseUrl: parsed.baseUrl,
            host: parsed.host,
            apiVersion: parsed.apiVersion,
            syncedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return updated;
  }

  async togglePublish(id: string, ownerId: string): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);
    const updated = await this.appModel
      .findOneAndUpdate(
        { _id: id, ownerId },
        { $set: { published: !app.published } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return updated;
  }

  async update(
    id: string,
    ownerId: string,
    dto: UpdateAppDto,
  ): Promise<AppDocument> {
    const updated = await this.appModel
      .findOneAndUpdate({ _id: id, ownerId }, { $set: dto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return updated;
  }

  async delete(id: string, ownerId: string): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);

    // Сценарии, чьи шаги используют это приложение, теперь не просто
    // "перестанут работать" молча — шаг помечается `broken`, а сам сценарий
    // блокируется от запуска, пока пользователь не удалит/пересоберёт шаг.
    // Уже запущенные `Run`ы этих сценариев отменяются явно, иначе воркер
    // продолжил бы их выполнять в фоне после удаления приложения.
    const blockedScenarioIds = await this.blockScenariosUsingApp(id, app.name);
    await this.executionService.cancelActiveRunsForScenarios(blockedScenarioIds);

    const deleted = await this.appModel
      .findOneAndDelete({ _id: id, ownerId })
      .exec();
    if (!deleted) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return deleted;
  }

  private requireOpenapiUrl(app: AppDocument): string {
    if (!app.openapiUrl) {
      throw new BadRequestException(
        "Переимпорт недоступен: приложение импортировано из файла без URL спецификации",
      );
    }
    return app.openapiUrl;
  }

  private async blockScenariosUsingApp(
    appId: string,
    appName: string,
  ): Promise<string[]> {
    const scenarios = await this.scenarioModel
      .find({ "steps.appId": appId })
      .exec();

    const blockedIds: string[] = [];

    for (const scenario of scenarios) {
      const steps = (scenario.steps ?? []) as Step[];
      let changed = false;

      const markedSteps = steps.map((step) => {
        if ("appId" in step && step.appId === appId && !step.broken) {
          changed = true;
          return { ...step, broken: true };
        }
        return step;
      });

      if (!changed) continue;

      scenario.steps = markedSteps as never;
      scenario.blocked = true;
      // Заблокированный сценарий не может оставаться опубликованным — иначе
      // он продолжил бы висеть в маркетплейсе со сломанным шагом.
      scenario.published = false;
      scenario.blockedReason = `Приложение «${appName}» удалено — обновите или удалите отмеченный шаг, чтобы разблокировать сценарий`;
      await scenario.save();
      blockedIds.push(scenario._id.toString());
    }

    return blockedIds;
  }
}
