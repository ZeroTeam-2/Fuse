import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomUUID } from "crypto";
import { EndpointStatus } from "@fuse/shared";
import type {
  Endpoint,
  Environment,
  ImportPreviewResult,
  PaginatedResponse,
  ReimportDiff,
  Step,
} from "@fuse/shared";
import { App, AppDocument, EnvironmentDoc } from "./app.schema";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";
import { OpenApiParserService } from "./openapi-parser";
import { SsrfGuard } from "./ssrf-guard";
import { parseSpecText } from "./spec-text-parser";
import { ExecutionService } from "../execution/execution.service";
import {
  BASE_URL_VAR_KEY,
  PROD_ENV_NAME,
  isAbsoluteHttpUrl,
} from "./base-url";
import type { CreateAppDto } from "./dto/create-app.dto";
import type { ImportPreviewDto } from "./dto/import-preview.dto";
import type { UpdateAppDto } from "./dto/update-app.dto";
import type {
  CreateEnvironmentDto,
  UpdateEnvironmentDto,
} from "./dto/environment.dto";

type EndpointSummary = Pick<Endpoint, "method" | "path" | "summary" | "tag">;

function endpointKey(ep: { method: string; path: string }): string {
  return `${ep.method}:${ep.path}`;
}

function toSummary(ep: Endpoint): EndpointSummary {
  return { method: ep.method, path: ep.path, summary: ep.summary, tag: ep.tag };
}

/** Окружение Prod по умолчанию: набор переменных с базовым `baseUrl`. */
function prodEnvironment(baseUrl?: string): Environment {
  return {
    id: randomUUID(),
    name: PROD_ENV_NAME,
    variables: [{ key: BASE_URL_VAR_KEY, value: baseUrl ?? "" }],
  };
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
    // Приложения, созданные до появления окружений, получают Prod при первом
    // открытии владельцем — так карточка и вкладка «Окружения» всегда видят его.
    if (ownerId) {
      await this.ensureProdEnvironment(app);
    }
    return app;
  }

  /** Гарантирует наличие окружения Prod (для приложений, созданных до окружений). */
  private async ensureProdEnvironment(app: AppDocument): Promise<void> {
    if ((app.environments?.length ?? 0) > 0) {
      return;
    }
    app.environments = [prodEnvironment(app.baseUrl)] as EnvironmentDoc[];
    await app.save();
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
      environments: [prodEnvironment(parsed.baseUrl)],
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
      environments: [prodEnvironment(parsed.baseUrl)],
      published: false,
      syncedAt: new Date(),
    }).save();
  }

  async reimport(id: string, ownerId: string): Promise<ReimportDiff> {
    const app = await this.findById(id, ownerId);
    const openapiUrl = this.requireOpenapiUrl(app);

    const rawSpec = await this.ssrfGuard.fetchSpec(openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec, openapiUrl);

    return this.diffEndpoints(app.endpoints, parsed.endpoints);
  }

  async applyReimport(id: string, ownerId: string): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);
    const openapiUrl = this.requireOpenapiUrl(app);

    const rawSpec = await this.ssrfGuard.fetchSpec(openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec, openapiUrl);

    return this.persistReimport(app, {
      endpoints: this.mergeEndpoints(app.endpoints, parsed.endpoints),
      baseUrl: parsed.baseUrl,
      host: parsed.host,
      apiVersion: parsed.apiVersion,
    });
  }

  /**
   * Реимпорт из загруженного файла: тот же диф, что и по URL. Файл шлётся и в
   * диф, и в apply (состояния на сервере нет) — симметрично паре создания
   * `import-preview-file` / `from-file`. `openapiUrl` приложения не требуется
   * и не меняется.
   */
  async reimportFromFile(
    id: string,
    ownerId: string,
    params: { specText: string; contentType: string; baseUrlOverride?: string },
  ): Promise<ReimportDiff> {
    const app = await this.findById(id, ownerId);
    const parsed = await this.parseSpecFile(params);

    return this.diffEndpoints(app.endpoints, parsed.endpoints);
  }

  async applyReimportFromFile(
    id: string,
    ownerId: string,
    params: { specText: string; contentType: string; baseUrlOverride?: string },
  ): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);
    const parsed = await this.parseSpecFile(params);

    // Файл без абсолютного `servers` (и без переопределения) не должен затирать
    // рабочий baseUrl приложения пустотой: в отличие от создания, URL уже есть.
    return this.persistReimport(app, {
      endpoints: this.mergeEndpoints(app.endpoints, parsed.endpoints),
      baseUrl: parsed.baseUrl ?? app.baseUrl,
      host: parsed.host ?? app.host,
      apiVersion: parsed.apiVersion ?? app.apiVersion,
    });
  }

  private async parseSpecFile(params: {
    specText: string;
    contentType: string;
    baseUrlOverride?: string;
  }) {
    const rawSpec = parseSpecText(params.specText, params.contentType);
    return this.openapiParser.parse(rawSpec, "", {
      baseUrlOverride: params.baseUrlOverride,
    });
  }

  /** Диф реимпорта: новые / исчезнувшие / совпавшие endpoints по методу+пути. */
  private diffEndpoints(
    current: Endpoint[],
    incoming: Endpoint[],
  ): ReimportDiff {
    const oldKeys = new Set(current.map(endpointKey));
    const newKeys = new Set(incoming.map(endpointKey));

    const added: EndpointSummary[] = [];
    const kept: EndpointSummary[] = [];

    for (const ep of incoming) {
      if (oldKeys.has(endpointKey(ep))) {
        kept.push(toSummary(ep));
      } else {
        added.push(toSummary(ep));
      }
    }

    const deprecated: EndpointSummary[] = current
      .filter((ep) => !newKeys.has(endpointKey(ep)))
      .map(toSummary);

    return { added, deprecated, kept };
  }

  /**
   * Слияние endpoints реимпорта: совпавшие сохраняют id (на них ссылаются шаги
   * сценариев), исчезнувшие остаются с пометкой deprecated.
   */
  private mergeEndpoints(current: Endpoint[], incoming: Endpoint[]): Endpoint[] {
    const oldEndpoints = new Map<string, Endpoint>();
    for (const ep of current) {
      oldEndpoints.set(endpointKey(ep), ep);
    }

    const newKeys = new Set(incoming.map(endpointKey));

    const merged: Endpoint[] = incoming.map((ep) => {
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

    return merged;
  }

  private async persistReimport(
    app: AppDocument,
    update: {
      endpoints: Endpoint[];
      baseUrl?: string;
      host?: string;
      apiVersion?: string;
    },
  ): Promise<AppDocument> {
    const updated = await this.appModel
      .findOneAndUpdate(
        { _id: app._id, ownerId: app.ownerId },
        { $set: { ...update, syncedAt: new Date() } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`App #${app._id} not found`);
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

  async addEnvironment(
    id: string,
    ownerId: string,
    dto: CreateEnvironmentDto,
  ): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException("Название окружения обязательно");
    }
    if ((app.environments ?? []).some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      throw new BadRequestException(`Окружение «${name}» уже существует`);
    }
    if (!isAbsoluteHttpUrl(dto.baseUrl)) {
      throw new BadRequestException(
        "Base URL должен быть абсолютным адресом со схемой http(s)",
      );
    }

    app.environments.push({
      id: randomUUID(),
      name,
      variables: [{ key: BASE_URL_VAR_KEY, value: dto.baseUrl }],
    } as EnvironmentDoc);
    await app.save();
    return app;
  }

  async updateEnvironment(
    id: string,
    ownerId: string,
    envId: string,
    dto: UpdateEnvironmentDto,
  ): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);
    const env = (app.environments ?? []).find((e) => e.id === envId);
    if (!env) {
      throw new NotFoundException("Окружение не найдено");
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Название окружения обязательно");
      }
      // Prod — точка опоры для резолва базового URL при исполнении; переименование
      // сломало бы фолбэк, поэтому имя Prod фиксировано.
      if (env.name === PROD_ENV_NAME && name !== PROD_ENV_NAME) {
        throw new BadRequestException("Окружение Prod нельзя переименовать");
      }
      if (
        (app.environments ?? []).some(
          (e) => e.id !== envId && e.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new BadRequestException(`Окружение «${name}» уже существует`);
      }
      env.name = name;
    }

    if (dto.baseUrl !== undefined) {
      if (!isAbsoluteHttpUrl(dto.baseUrl)) {
        throw new BadRequestException(
          "Base URL должен быть абсолютным адресом со схемой http(s)",
        );
      }
      const variable = env.variables.find((v) => v.key === BASE_URL_VAR_KEY);
      if (variable) {
        variable.value = dto.baseUrl;
      } else {
        env.variables.push({ key: BASE_URL_VAR_KEY, value: dto.baseUrl });
      }
    }

    app.markModified("environments");
    await app.save();
    return app;
  }

  async deleteEnvironment(
    id: string,
    ownerId: string,
    envId: string,
  ): Promise<AppDocument> {
    const app = await this.findById(id, ownerId);
    const env = (app.environments ?? []).find((e) => e.id === envId);
    if (!env) {
      throw new NotFoundException("Окружение не найдено");
    }
    if (env.name === PROD_ENV_NAME) {
      throw new BadRequestException("Окружение Prod нельзя удалить");
    }

    app.environments = (app.environments ?? []).filter(
      (e) => e.id !== envId,
    ) as EnvironmentDoc[];
    await app.save();
    return app;
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
