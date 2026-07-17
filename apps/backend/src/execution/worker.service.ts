import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Consumer } from "sqs-consumer";
import { SQSClient } from "@aws-sdk/client-sqs";
import { RunStatus, isUploadedFileRef } from "@fuse/shared";
import type {
  Step,
  ApiStep,
  DelayStep,
  PeriodicStep,
  ScenarioStepRef,
  FileStep,
  UploadedFileRef,
  EnvironmentSelection,
  ManualInputDescriptor,
  RunStepResult,
  SchemaField,
  ServerWsEvent,
} from "@fuse/shared";
import { Run, RunDocument } from "./run.schema";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";
import { App, AppDocument } from "../apps/app.schema";
import { SsrfGuard } from "../apps/ssrf-guard";
import { joinBaseUrl, resolveAppBaseUrl } from "../apps/base-url";
import { RunGateway } from "../websocket/run.gateway";
import { MinioService } from "../minio/minio.service";
import { resolveMappings, groupInputsByLocation } from "./mapping-resolver";
import type { LocatedInputs } from "./mapping-resolver";
import { ManualInputsService } from "./manual-inputs.service";
import {
  isBlank,
  localKeyOf,
  mapPageDataToLocalKeys,
  resolvePageBindings,
  sliceInputsForStep,
} from "./manual-inputs";
import {
  StepExecutionError,
  RunCancelledError,
  RunPausedError,
} from "./execution-errors";

const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const TERMINAL_STATUSES: RunStatus[] = [
  RunStatus.COMPLETED,
  RunStatus.FAILED,
  RunStatus.CANCELLED,
];

function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

interface StepContext {
  runId: string;
  stepIndex: number;
  /** Путь до шага от корня запуска: `[3]` либо `[2, 0]` для шага вложенного сценария. */
  stepPath: number[];
  stepResults: RunStepResult[];
  /** Кэш приложений на время одного запуска: N шагов к одному API — один запрос в БД. */
  appCache: Map<string, AppDocument>;
  /** Выбор окружения по поставщику (из сценария): по нему резолвится базовый URL. */
  environmentSelections: EnvironmentSelection[];
  /**
   * Ввод шага по ЛОКАЛЬНЫМ ключам (`inn`, `filter:orgId`) — ровно то, что ищет
   * резолвер: срез входов запуска, адресованных этому шагу, поверх накопленного
   * по предыдущим шагам, и поверх всего — данные страницы шага.
   */
  userInput?: Record<string, unknown>;
  /** Входы запуска целиком, по скоуп-ключам. Обновляются при доборе значений. */
  runInputs: Record<string, unknown>;
  /** Ручные значения всего сценария: по ним видно, чего шагу не хватает. */
  descriptors: ManualInputDescriptor[];
  /** Некритичные замечания резолвера (неоднозначный фильтр) — уходят в результат шага. */
  warnings: string[];
}

@Injectable()
export class WorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerService.name);
  private consumer: Consumer | null = null;

  constructor(
    @InjectModel(Run.name) private readonly runModel: Model<RunDocument>,
    @InjectModel(Scenario.name)
    private readonly scenarioModel: Model<ScenarioDocument>,
    @InjectModel(App.name) private readonly appModel: Model<AppDocument>,
    private readonly configService: ConfigService,
    private readonly gateway: RunGateway,
    private readonly ssrfGuard: SsrfGuard,
    private readonly manualInputsService: ManualInputsService,
    private readonly minioService: MinioService,
  ) {}

  onApplicationBootstrap(): void {
    this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  start(): void {
    if (this.consumer) {
      return;
    }

    const endpoint = this.configService.get<string>("AWS_ENDPOINT_URL");
    const region = this.configService.get<string>("AWS_REGION") ?? "us-east-1";
    const accessKeyId = this.configService.get<string>("AWS_ACCESS_KEY_ID") ?? "test";
    const secretAccessKey = this.configService.get<string>("AWS_SECRET_ACCESS_KEY") ?? "test";
    const queueUrl = this.configService.get<string>("AWS_SQS_QUEUE_URL")!;

    const sqsClient = new SQSClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint } : {}),
    });

    this.consumer = Consumer.create({
      queueUrl,
      sqs: sqsClient,
      batchSize: 5,
      waitTimeSeconds: 20,
      visibilityTimeout: 7200,
      handleMessage: async (message) => {
        const { runId } = JSON.parse(message.Body ?? "{}") as { runId: string };
        await this.executeRun(runId);
      },
    });

    this.consumer.on("message_processed", (message) => {
      this.logger.log(`Message ${message.MessageId} processed`);
    });

    this.consumer.on("processing_error", (err, message) => {
      this.logger.error(`Message ${message?.MessageId} failed: ${err.message}`);
    });

    this.consumer.on("error", (err) => {
      this.logger.error(`SQS consumer error: ${err.message}`);
    });

    this.consumer.start();

    this.logger.log("Worker started — processing scenario execution jobs");
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      this.consumer.stop();
      this.consumer = null;
    }
  }

  private async publish(runId: string, event: ServerWsEvent): Promise<void> {
    this.gateway.publish(runId, event);
  }

  /**
   * Раскладывает `stepResults` в массив фиксированной длины (по элементу на шаг).
   * Дальше шаги пишутся АДРЕСНО по индексу, а не через `$push` + позиционный `$`:
   * повторная доставка сообщения перезаписывает элемент, а не добавляет дубль.
   */
  private async initStepResults(
    runId: string,
    steps: Step[],
    existing: RunStepResult[],
  ): Promise<void> {
    if (existing.length === steps.length) {
      return;
    }

    const seeded: RunStepResult[] = steps.map((step, i) => {
      const prior = existing.find((sr) => sr.stepIndex === i);
      return (
        prior ?? {
          stepIndex: i,
          stepTitle: step.title,
          status: "pending",
        }
      );
    });

    await this.runModel
      .updateOne({ _id: runId }, { $set: { stepResults: seeded as never } })
      .exec();
  }

  private async setStepResult(
    runId: string,
    stepIndex: number,
    update: RunStepResult,
  ): Promise<void> {
    await this.runModel
      .updateOne(
        { _id: runId },
        { $set: { [`stepResults.${stepIndex}`]: update as never } },
      )
      .exec();
  }

  private async executeRun(runId: string): Promise<void> {
    const run = await this.runModel.findById(runId).exec();
    if (!run) {
      this.logger.error(`Run ${runId} not found`);
      return;
    }

    // Повторная доставка уже завершённого запуска не должна воскрешать его.
    if (TERMINAL_STATUSES.includes(run.status)) {
      this.logger.log(
        `Run ${runId} is already ${run.status}, skipping redelivered message`,
      );
      return;
    }

    const scenario = await this.scenarioModel.findById(run.scenarioId).exec();

    if (!scenario) {
      await this.failRun(runId, "Scenario not found");
      return;
    }

    const steps = (scenario.steps ?? []) as Step[];
    const startStep = run.currentStep ?? 0;
    const appCache = new Map<string, AppDocument>();
    const environmentSelections = (scenario.environmentSelections ??
      []) as EnvironmentSelection[];

    // Считается один раз на запуск: этим же списком форма запуска строила поля.
    const descriptors = await this.manualInputsService.forSteps(
      steps,
      run.scenarioId,
    );
    const runInputs = (run.inputs ?? {}) as Record<string, unknown>;

    // Ввод, накопленный по ходу (данные страниц шагов), переживает переход к
    // следующему шагу: раньше `StepContext` пересоздавался пустым, и введённое
    // на шаге 1 не видел уже шаг 2.
    let accumulatedInput: Record<string, unknown> = {};

    await this.initStepResults(
      runId,
      steps,
      run.stepResults as unknown as RunStepResult[],
    );

    await this.runModel
      .updateOne({ _id: runId }, { $set: { status: RunStatus.RUNNING } })
      .exec();

    for (let i = startStep; i < steps.length; i++) {
      const step = steps[i];
      const reloadedRun = await this.runModel.findById(runId).exec();
      if (!reloadedRun || reloadedRun.status === RunStatus.CANCELLED) {
        this.logger.log(`Run ${runId} cancelled mid-execution`);
        return;
      }

      await this.runModel
        .updateOne({ _id: runId }, { $set: { currentStep: i } })
        .exec();

      const startedAt = new Date().toISOString();

      await this.setStepResult(runId, i, {
        stepIndex: i,
        stepTitle: step.title,
        status: "running",
        startedAt,
      });

      await this.publish(runId, {
        type: "step:start",
        runId,
        payload: {
          stepIndex: i,
          stepTitle: step.title,
          totalSteps: steps.length,
        },
        timestamp: new Date().toISOString(),
      });

      try {
        const ctx: StepContext = {
          runId,
          stepIndex: i,
          stepPath: [i],
          stepResults: reloadedRun.stepResults as unknown as RunStepResult[],
          appCache,
          environmentSelections,
          // Свой срез входов запуска важнее значения, принесённого с прошлых
          // шагов: одноимённые ключи разных шагов не должны склеиваться.
          userInput: {
            ...accumulatedInput,
            ...sliceInputsForStep(runInputs, [i]),
          },
          runInputs,
          descriptors,
          warnings: [],
        };

        const result = await this.executeStep(step, ctx);
        accumulatedInput = { ...accumulatedInput, ...(ctx.userInput ?? {}) };

        const finishedAt = new Date().toISOString();
        const durationMs =
          new Date(finishedAt).getTime() - new Date(startedAt).getTime();

        await this.setStepResult(runId, i, {
          stepIndex: i,
          stepTitle: step.title,
          status: "completed",
          result,
          ...(ctx.warnings.length ? { warnings: ctx.warnings } : {}),
          startedAt,
          finishedAt,
          durationMs,
        });

        await this.publish(runId, {
          type: "step:done",
          runId,
          payload: {
            stepIndex: i,
            stepTitle: step.title,
            durationMs,
            result,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof RunPausedError) {
          // Шаг ждёт ввода: обработчик освобождаем, сообщение подтверждается.
          // Продолжение придёт отдельным сообщением при submit'е.
          this.logger.log(`Run ${runId} paused for input at step ${i}`);
          return;
        }

        if (err instanceof RunCancelledError) {
          this.logger.log(`Run ${runId} cancelled during step ${i}`);
          return;
        }

        // Инфраструктурный сбой (например, MongoDB): не фиксируем `failed`,
        // отдаём сообщение обратно в очередь — повтор здесь осмыслен.
        if (!(err instanceof StepExecutionError)) {
          throw err;
        }

        const error = err.message;
        const finishedAt = new Date().toISOString();

        await this.setStepResult(runId, i, {
          stepIndex: i,
          stepTitle: step.title,
          status: "failed",
          error,
          startedAt,
          finishedAt,
        });

        await this.publish(runId, {
          type: "run:error",
          runId,
          payload: {
            stepIndex: i,
            stepTitle: step.title,
            error,
          },
          timestamp: new Date().toISOString(),
        });

        await this.failRun(runId, error);
        // Сообщение подтверждается: детерминированный сбой ретраить нечем.
        return;
      }
    }

    await this.runModel
      .updateOne(
        { _id: runId },
        { $set: { status: RunStatus.COMPLETED, currentStep: steps.length } },
      )
      .exec();

    await this.scenarioModel
      .updateOne({ _id: run.scenarioId }, { $inc: { runCount: 1 } })
      .exec();

    const finalRun = await this.runModel.findById(runId).exec();
    const stepResults = (finalRun?.stepResults ??
      []) as unknown as RunStepResult[];
    const totalDurationMs = stepResults.reduce(
      (sum, sr) => sum + (sr.durationMs ?? 0),
      0,
    );

    await this.publish(runId, {
      type: "run:done",
      runId,
      payload: {
        totalDurationMs,
        results: stepResults.map((sr) => sr.result),
      },
      timestamp: new Date().toISOString(),
    });

    await this.publish(runId, {
      type: "run:status",
      runId,
      payload: {
        status: RunStatus.COMPLETED,
        currentStep: steps.length,
        stepResults,
      },
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Run ${runId} completed successfully`);
  }

  private async executeStep(step: Step, ctx: StepContext): Promise<unknown> {
    if (step.page) {
      // То, что пользователь ввёл на странице, — это и есть входные данные шага:
      // раньше результат ожидания отбрасывался, и ветка «Ручной ввод» в маппингах
      // (а с ней и ручное значение условия фильтра) была мертва.
      const { data } = await this.requestUserInput(
        ctx.runId,
        ctx.stepIndex,
        step.title,
        {
          type: "page:required",
          runId: ctx.runId,
          payload: {
            stepIndex: ctx.stepIndex,
            stepTitle: step.title,
            page: step.page,
            // Блоки отображения и динамические варианты select берут данные
            // пройденных шагов: клиент их сам не видит, поэтому значения
            // разрешаются здесь и едут в payload.
            resolved: resolvePageBindings(step.page, ctx.stepResults),
          },
          timestamp: new Date().toISOString(),
        },
      );

      if (data && typeof data === "object") {
        // Ключи полей страницы → ключи значений шага по привязке (`target`).
        ctx.userInput = {
          ...ctx.userInput,
          ...mapPageDataToLocalKeys(step, data),
        };
      }
    }

    await this.ensureManualInputs(step, ctx);

    switch (step.type) {
      case "api":
        return this.executeApiStep(step, ctx);

      case "delay":
        return this.executeDelayStep(step);

      case "periodic":
        return this.executePeriodicStep(step, ctx);

      case "scenario":
        return this.executeScenarioStep(step, ctx);

      case "file":
        return this.executeFileStep(step, ctx);

      default:
        return {
          skipped: true,
          reason: `Unknown step type: ${(step as { type: string }).type}`,
        };
    }
  }

  /**
   * Приложение шага — с кэшем на запуск.
   */
  private async loadApp(appId: string, ctx: StepContext): Promise<AppDocument> {
    const cached = ctx.appCache.get(appId);
    if (cached) {
      return cached;
    }

    const app = await this.appModel.findById(appId).exec();
    if (!app) {
      throw new StepExecutionError(
        `Приложение ${appId} не найдено — шаг ссылается на удалённое приложение`,
      );
    }

    ctx.appCache.set(appId, app);
    return app;
  }

  /**
   * Собирает АБСОЛЮТНЫЙ URL вызова: базовый URL приложения + путь эндпоинта.
   * Раньше в `fetch` уходил относительный путь из OpenAPI ("/collections"), на
   * котором Node падал с "Failed to parse URL" — именно это и ломало запуски.
   */
  private async resolveStepUrl(
    appId: string,
    path: string,
    located: LocatedInputs,
    ctx: StepContext,
  ): Promise<string> {
    const app = await this.loadApp(appId, ctx);

    // Базовый URL берётся из окружения, выбранного для этого поставщика в
    // сценарии (по умолчанию — Prod, крайний фолбэк — app.baseUrl).
    const environmentId = ctx.environmentSelections?.find(
      (s) => s.appId === appId,
    )?.environmentId;
    const baseUrl = resolveAppBaseUrl(app, environmentId);

    if (!baseUrl) {
      throw new StepExecutionError(
        `У приложения «${app.name}» не задан базовый URL — переимпортируйте спецификацию OpenAPI`,
      );
    }

    const withPathParams = this.applyPathParams(path, located.path);

    let url: string;
    try {
      url = joinBaseUrl(baseUrl, withPathParams);
    } catch {
      throw new StepExecutionError(
        `Некорректный базовый URL приложения «${app.name}»: ${baseUrl}`,
      );
    }

    url = this.appendQuery(url, located.query);

    try {
      await this.ssrfGuard.assertSafeUrl(url);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new StepExecutionError(`Адрес ${url} отклонён: ${reason}`);
    }

    return url;
  }

  /**
   * Общая для api- и periodic-шага сборка вызова endpoint'а: входы раскладываются
   * по местам согласно схеме endpoint (path/query/header/body), из них собираются
   * абсолютный URL и опции запроса. Без `endpointId` (легаси periodic-шаги)
   * endpoint ищется по методу и пути; не нашёлся — работаем без схемы: путь
   * спасают плейсхолдеры, остальные входы уезжают в тело.
   */
  private async buildEndpointRequest(
    step: { appId: string; endpointId?: string },
    method: string,
    path: string,
    resolved: Record<string, unknown>,
    ctx: StepContext,
  ): Promise<{
    url: string;
    options: RequestInit;
    located: LocatedInputs;
    inputs: SchemaField[];
  }> {
    const app = await this.loadApp(step.appId, ctx);
    const endpoints = app.endpoints ?? [];
    const endpoint = step.endpointId
      ? endpoints.find((ep) => ep.id === step.endpointId)
      : endpoints.find((ep) => ep.method === method && ep.path === path);
    const inputs = (endpoint?.inputs ?? []) as unknown as SchemaField[];
    const located = groupInputsByLocation(resolved, inputs, path);

    const url = await this.resolveStepUrl(step.appId, path, located, ctx);

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...this.toStringRecord(located.header),
      },
    };

    if (method !== "GET" && method !== "DELETE") {
      if (Object.keys(located.body).length > 0) {
        options.body = JSON.stringify(located.body);
      }
    }

    return { url, options, located, inputs };
  }

  private async executeApiStep(
    step: ApiStep,
    ctx: StepContext,
  ): Promise<unknown> {
    const resolved = resolveMappings(step, ctx.stepResults, ctx.userInput, ctx.warnings);
    const { url, options } = await this.buildEndpointRequest(
      step,
      step.method,
      step.path,
      resolved,
      ctx,
    );

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new StepExecutionError(`Не удалось вызвать ${url}: ${reason}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new StepExecutionError(
        `API call failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  private applyPathParams(path: string, pathParams: Record<string, unknown>): string {
    let result = path;

    for (const [key, value] of Object.entries(pathParams)) {
      if (value === undefined || value === null) continue;
      result = result.replace(`{${key}}`, encodeURIComponent(String(value)));
    }

    return result;
  }

  private appendQuery(url: string, queryParams: Record<string, unknown>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }

    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  private toStringRecord(
    value: unknown,
  ): Record<string, string> | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = String(v);
    }
    return result;
  }

  private async executeDelayStep(step: DelayStep): Promise<unknown> {
    await this.sleep(step.seconds * 1000);
    return { delayed: step.seconds };
  }

  private async executePeriodicStep(
    step: PeriodicStep,
    ctx: StepContext,
  ): Promise<unknown> {
    const resolved = resolveMappings(step, ctx.stepResults, ctx.userInput, ctx.warnings);
    // Входы между итерациями не меняются — URL и опции собираются один раз до цикла.
    const { url, options } = await this.buildEndpointRequest(
      step,
      step.pollMethod,
      step.pollPath,
      resolved,
      ctx,
    );
    return this.pollUntilComplete(
      url,
      options,
      step.pollIntervalSec,
      step.progressField,
      ctx,
    );
  }

  /**
   * Общий цикл опроса endpoint'а до признака завершения — периодический шаг и
   * стадия обработки файлового шага отличаются только тем, как собран запрос.
   */
  private async pollUntilComplete(
    url: string,
    options: RequestInit,
    intervalSec: number | undefined,
    progressField: string | undefined,
    ctx: StepContext,
  ): Promise<unknown> {
    const intervalMs = (intervalSec ?? 5) * 1000;
    const startTime = Date.now();

    let lastResult: unknown = null;

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      const run = await this.runModel.findById(ctx.runId).exec();
      if (!run || run.status === RunStatus.CANCELLED) {
        throw new RunCancelledError("Run was cancelled");
      }

      let response: Response;
      try {
        response = await fetch(url, options);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new StepExecutionError(`Не удалось опросить ${url}: ${reason}`);
      }

      if (!response.ok) {
        throw new StepExecutionError(
          `Poll failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json().catch(() => null);
      lastResult = data;

      if (progressField && data && typeof data === "object") {
        const progress = (data as Record<string, unknown>)[progressField];
        if (progress !== undefined) {
          await this.publish(ctx.runId, {
            type: "progress",
            runId: ctx.runId,
            payload: {
              stepIndex: ctx.stepIndex,
              progress:
                typeof progress === "number" ? progress : Number(progress) || 0,
            },
            timestamp: new Date().toISOString(),
          });
        }
      }

      if (this.isPollComplete(data)) {
        return data;
      }

      await this.sleep(intervalMs);
    }

    return { timedOut: true, lastResult };
  }

  private isPollComplete(data: unknown): boolean {
    if (!data || typeof data !== "object") {
      return false;
    }
    const obj = data as Record<string, unknown>;
    return (
      obj.status === "completed" ||
      obj.status === "done" ||
      obj.complete === true ||
      obj.finished === true
    );
  }

  private async executeScenarioStep(
    step: ScenarioStepRef,
    ctx: StepContext,
  ): Promise<unknown> {
    const refScenario = await this.scenarioModel
      .findById(step.refScenarioId)
      .exec();

    if (!refScenario) {
      throw new StepExecutionError(
        `Referenced scenario ${step.refScenarioId} not found`,
      );
    }

    const refSteps = (refScenario.steps ?? []) as Step[];
    const nestedResults: RunStepResult[] = [];
    // Окружения вложенного сценария — его собственные: поставщики его шагов
    // резолвятся по выбору, сделанному в этом сценарии, а не в объемлющем.
    const nestedEnvironmentSelections = (refScenario.environmentSelections ??
      []) as EnvironmentSelection[];

    for (let i = 0; i < refSteps.length; i++) {
      const refStep = refSteps[i];
      // Путь от корня запуска: по нему вложенный шаг находит адресованные
      // именно ему входы (`s2.s0:inn`), а не значения объемлющего сценария.
      const nestedPath = [...ctx.stepPath, i];
      const nestedCtx: StepContext = {
        runId: ctx.runId,
        stepIndex: i,
        stepPath: nestedPath,
        stepResults: nestedResults,
        appCache: ctx.appCache,
        environmentSelections: nestedEnvironmentSelections,
        userInput: {
          ...ctx.userInput,
          ...sliceInputsForStep(ctx.runInputs, nestedPath),
        },
        runInputs: ctx.runInputs,
        descriptors: ctx.descriptors,
        // Замечания вложенных шагов всплывают в результат объемлющего шага.
        warnings: ctx.warnings,
      };
      const result = await this.executeStep(refStep, nestedCtx);
      nestedResults.push({
        stepIndex: i,
        stepTitle: refStep.title,
        status: "completed",
        result,
      });
    }

    if (nestedResults.length > 0) {
      return nestedResults[nestedResults.length - 1].result;
    }

    return { nestedScenario: step.refScenarioId };
  }

  /**
   * Файл загружен страницей шага в MinIO до сабмита; сюда приходит только
   * ссылка `UploadedFileRef` — по ней объект читается и уезжает провайдеру
   * multipart-запросом. Ответ провайдера (или финальный ответ опроса
   * `statusEndpoint`) — результат шага; внутренние `objectName`/URL хранилища
   * в результат не попадают.
   */
  private async executeFileStep(
    step: FileStep,
    ctx: StepContext,
  ): Promise<unknown> {
    if (!step.appId || !step.uploadPath) {
      throw new StepExecutionError(
        `Шаг «${step.title}» не настроен: не выбраны приложение или endpoint загрузки`,
      );
    }

    // Значение dropzone-блока страницы — единственный источник файла. Ключ —
    // привязка блока (`binding`), по ней ниже выбирается multipart-поле.
    const fileEntry = Object.entries(ctx.userInput ?? {}).find(([, v]) =>
      isUploadedFileRef(v),
    );
    const fileRef = fileEntry?.[1] as UploadedFileRef | undefined;
    if (!fileRef) {
      throw new StepExecutionError(
        `Шаг «${step.title}»: файл не был загружен — отправьте файл со страницы шага`,
      );
    }

    const resolved = resolveMappings(step, ctx.stepResults, ctx.userInput, ctx.warnings);
    // Файловая ссылка не должна уехать в body текстовым полем — файл поедет multipart-частью.
    const textInputs = Object.fromEntries(
      Object.entries(resolved).filter(([, v]) => !isUploadedFileRef(v)),
    );

    const method = step.uploadMethod ?? "POST";
    const { url, options, located, inputs } = await this.buildEndpointRequest(
      { appId: step.appId },
      method,
      step.uploadPath,
      textInputs,
      ctx,
    );

    let buffer: Buffer;
    try {
      buffer = await this.minioService.getObjectBuffer(fileRef.objectName);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new StepExecutionError(
        `Не удалось прочитать файл «${fileRef.fileName}» из хранилища: ${reason}`,
      );
    }

    // Multipart-поле файла: body-вход бинарного типа из схемы endpoint'а;
    // иначе — привязка dropzone-блока, если она указывает на body-вход (спеки,
    // импортированные до маппинга `format: binary` → `file`, помечают файловое
    // поле строкой); без схемы (легаси) — "file".
    const bodyInputs = inputs.filter((f) => (f.loc ?? "body") === "body");
    const boundField = bodyInputs.find((f) => f.key === fileEntry?.[0])?.key;
    const fileField =
      bodyInputs.find((f) => f.type === "file")?.key ??
      boundField ??
      (bodyInputs.length === 1 && located.body[bodyInputs[0].key] === undefined
        ? bodyInputs[0].key
        : "file");

    const form = new FormData();
    const contentType =
      fileRef.fileType || step.contentType || "application/octet-stream";
    form.append(
      fileField,
      new Blob([new Uint8Array(buffer)], { type: contentType }),
      fileRef.fileName,
    );
    for (const [key, value] of Object.entries(located.body)) {
      if (key === fileField || value === undefined || value === null) continue;
      form.append(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
    }

    // Content-Type не выставляем руками: boundary впишет fetch.
    const headers = { ...(options.headers as Record<string, string>) };
    delete headers["Content-Type"];

    let response: Response;
    try {
      response = await fetch(url, { method, headers, body: form });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new StepExecutionError(`Не удалось вызвать ${url}: ${reason}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new StepExecutionError(
        `Загрузка файла провайдеру не удалась: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`,
      );
    }

    const respContentType = response.headers.get("content-type") ?? "";
    const uploadResult: unknown = respContentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!step.statusEndpoint) {
      return uploadResult;
    }

    // Входы опроса: маппинги шага + выходы ответа загрузки, чтобы идентификатор
    // задачи провайдера подставился в путь статуса ("{id}").
    const pollInputs: Record<string, unknown> = { ...textInputs };
    if (
      uploadResult &&
      typeof uploadResult === "object" &&
      !Array.isArray(uploadResult)
    ) {
      Object.assign(pollInputs, uploadResult as Record<string, unknown>);
    }

    const { url: pollUrl, options: pollOptions } =
      await this.buildEndpointRequest(
        { appId: step.appId },
        step.statusEndpoint.method,
        step.statusEndpoint.path,
        pollInputs,
        ctx,
      );

    return this.pollUntilComplete(
      pollUrl,
      pollOptions,
      step.statusEndpoint.intervalSec,
      step.statusEndpoint.progressField,
      ctx,
    );
  }

  /**
   * Обязательного ручного значения нет во входах запуска — спрашиваем его,
   * а не отправляем параметр пустым и не падаем на фильтре, который ничего не
   * отобрал. Страховка на случаи, которых форма запуска знать не могла:
   * программный запуск, отредактированный после создания запуска сценарий,
   * вложенный сценарий.
   */
  private async ensureManualInputs(step: Step, ctx: StepContext): Promise<void> {
    const missing = ctx.descriptors.filter(
      (d) =>
        d.required &&
        samePath(d.stepPath, ctx.stepPath) &&
        isBlank(ctx.userInput?.[localKeyOf(d.paramKey, d.kind)]),
    );

    if (missing.length === 0) {
      return;
    }

    const { inputs } = await this.requestUserInput(
      ctx.runId,
      ctx.stepIndex,
      step.title,
      {
        type: "input:required",
        runId: ctx.runId,
        payload: {
          stepIndex: ctx.stepIndex,
          stepTitle: step.title,
          fields: missing,
        },
        timestamp: new Date().toISOString(),
      },
    );

    // Добранное лежит в `Run.inputs` — переживёт перезапуск воркера и не будет
    // спрошено повторно.
    ctx.runInputs = inputs;
    ctx.userInput = {
      ...ctx.userInput,
      ...sliceInputsForStep(inputs, ctx.stepPath),
    };

    const stillMissing = missing.filter((d) =>
      isBlank(ctx.userInput?.[localKeyOf(d.paramKey, d.kind)]),
    );

    if (stillMissing.length > 0) {
      throw new StepExecutionError(
        `Шаг «${step.title}»: не заданы обязательные значения ручного ввода — ${stillMissing
          .map((d) => `«${d.label}»`)
          .join(", ")}`,
      );
    }
  }

  /**
   * Один запрос ввода на два случая: страница шага и добор ручных значений.
   * НЕ блокирует обработчик: если ввод уже пришёл (submit положил `pendingInput`
   * и до-ставил сообщение-продолжение) — возвращает его; иначе переводит запуск
   * в `waiting_input`, публикует запрос и бросает `RunPausedError`, по которому
   * `executeRun` штатно завершается и подтверждает сообщение SQS. Так ожидание
   * не держит слот консьюмера — одна непросабмиченная страница больше не морозит
   * весь воркер.
   */
  private async requestUserInput(
    runId: string,
    stepIndex: number,
    _stepTitle: string,
    request: ServerWsEvent,
  ): Promise<{ data: Record<string, unknown>; inputs: Record<string, unknown> }> {
    const run = await this.runModel.findById(runId).exec();
    if (!run) {
      throw new StepExecutionError("Run disappeared while waiting for input");
    }
    if (run.status === RunStatus.CANCELLED) {
      throw new RunCancelledError("Run was cancelled while waiting for input");
    }

    // Ввод для ЭТОГО шага уже пришёл? `pageData` — ящик запусков, созданных до
    // появления `pendingInput` (легаси), читаем его как запасной вариант.
    const pending =
      run.pendingInput?.stepIndex === stepIndex
        ? run.pendingInput?.data
        : (run.pageData as Record<string, unknown> | undefined);

    if (pending) {
      await this.runModel
        .updateOne({ _id: runId }, { $unset: { pendingInput: "", pageData: "" } })
        .exec();

      return {
        data: pending,
        inputs: (run.inputs ?? {}) as Record<string, unknown>,
      };
    }

    // Ввода ещё нет — спрашиваем и ОСВОБОЖДАЕМ обработчик. Продолжение придёт
    // отдельным сообщением, когда `ExecutionService` обработает submit.
    await this.runModel
      .updateOne(
        { _id: runId },
        { $set: { status: RunStatus.WAITING_INPUT, currentStep: stepIndex } },
      )
      .exec();

    await this.publish(runId, request);

    throw new RunPausedError(`Шаг «${_stepTitle}» ждёт ввода пользователя`);
  }

  private async failRun(runId: string, error: string): Promise<void> {
    await this.runModel
      .updateOne({ _id: runId }, { $set: { status: RunStatus.FAILED, error } })
      .exec();

    const run = await this.runModel.findById(runId).exec();

    await this.publish(runId, {
      type: "run:status",
      runId,
      payload: {
        status: RunStatus.FAILED,
        currentStep: run?.currentStep ?? 0,
        stepResults: run?.stepResults ?? [],
        error,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
