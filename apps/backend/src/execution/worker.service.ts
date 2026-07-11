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
import { RunStatus } from "@fuse/shared";
import type {
  Step,
  ApiStep,
  DelayStep,
  PeriodicStep,
  ScenarioStepRef,
  FileStep,
  RunStepResult,
  ServerWsEvent,
} from "@fuse/shared";
import { Run, RunDocument } from "./run.schema";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";
import { App, AppDocument } from "../apps/app.schema";
import { SsrfGuard } from "../apps/ssrf-guard";
import { joinBaseUrl } from "../apps/base-url";
import { RunGateway } from "../websocket/run.gateway";
import { resolveMappings } from "./mapping-resolver";
import { StepExecutionError, RunCancelledError } from "./execution-errors";

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const PAGE_INPUT_TIMEOUT_MS = 30 * 60 * 1000;

const TERMINAL_STATUSES: RunStatus[] = [
  RunStatus.COMPLETED,
  RunStatus.FAILED,
  RunStatus.CANCELLED,
];

interface StepContext {
  runId: string;
  stepIndex: number;
  stepResults: RunStepResult[];
  /** Кэш приложений на время одного запуска: N шагов к одному API — один запрос в БД. */
  appCache: Map<string, AppDocument>;
  /** Данные пользователя: входы запуска + то, что он ввёл на странице шага. */
  userInput?: Record<string, unknown>;
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
          stepResults: reloadedRun.stepResults as unknown as RunStepResult[],
          appCache,
          warnings: [],
        };

        const result = await this.executeStep(step, ctx);

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
      const pageData = await this.waitForPageInput(ctx.runId, step, ctx.stepIndex);
      if (pageData && typeof pageData === "object") {
        ctx.userInput = { ...ctx.userInput, ...(pageData as Record<string, unknown>) };
      }
    }

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
    resolved: Record<string, unknown>,
    ctx: StepContext,
  ): Promise<string> {
    const app = await this.loadApp(appId, ctx);

    if (!app.baseUrl) {
      throw new StepExecutionError(
        `У приложения «${app.name}» не задан базовый URL — переимпортируйте спецификацию OpenAPI`,
      );
    }

    const withPathParams = this.applyPathParams(path, resolved);

    let url: string;
    try {
      url = joinBaseUrl(app.baseUrl, withPathParams);
    } catch {
      throw new StepExecutionError(
        `Некорректный базовый URL приложения «${app.name}»: ${app.baseUrl}`,
      );
    }

    url = this.appendQuery(url, resolved);

    try {
      await this.ssrfGuard.assertSafeUrl(url);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new StepExecutionError(`Адрес ${url} отклонён: ${reason}`);
    }

    return url;
  }

  private async executeApiStep(
    step: ApiStep,
    ctx: StepContext,
  ): Promise<unknown> {
    const resolved = resolveMappings(step, ctx.stepResults, ctx.userInput, ctx.warnings);
    const url = await this.resolveStepUrl(step.appId, step.path, resolved, ctx);

    const options: RequestInit = {
      method: step.method,
      headers: {
        "Content-Type": "application/json",
        ...this.toStringRecord(resolved.headers),
      },
    };

    if (step.method !== "GET" && step.method !== "DELETE") {
      if (resolved.body !== undefined) {
        options.body = JSON.stringify(resolved.body);
      }
    }

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

  private applyPathParams(
    path: string,
    resolved: Record<string, unknown>,
  ): string {
    let result = path;

    const pathParams = this.toRecord(resolved.path);
    if (pathParams) {
      for (const [key, value] of Object.entries(pathParams)) {
        result = result.replace(`{${key}}`, String(value));
      }
    }

    return result;
  }

  private appendQuery(url: string, resolved: Record<string, unknown>): string {
    const queryParams = this.toRecord(resolved.query);
    if (!queryParams) {
      return url;
    }

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

  private toRecord(
    value: unknown,
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return value as Record<string, unknown>;
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
    const url = await this.resolveStepUrl(
      step.appId,
      step.pollPath,
      resolved,
      ctx,
    );
    const intervalMs = (step.pollIntervalSec ?? 5) * 1000;
    const progressField = step.progressField;
    const startTime = Date.now();

    let lastResult: unknown = null;

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      const run = await this.runModel.findById(ctx.runId).exec();
      if (!run || run.status === RunStatus.CANCELLED) {
        throw new RunCancelledError("Run was cancelled");
      }

      let response: Response;
      try {
        response = await fetch(url, { method: step.pollMethod });
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

    for (let i = 0; i < refSteps.length; i++) {
      const refStep = refSteps[i];
      const nestedCtx: StepContext = {
        runId: ctx.runId,
        stepIndex: i,
        stepResults: nestedResults,
        appCache: ctx.appCache,
        userInput: ctx.userInput,
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

  // Шаг «файл» пока заглушка (загрузка в MinIO — отдельная задача). Когда он
  // появится, адрес выгрузки берётся тем же `resolveStepUrl(step.appId, step.uploadPath, ...)`.
  private async executeFileStep(
    _step: FileStep,
    _ctx: StepContext,
  ): Promise<unknown> {
    return { placeholder: true, message: "File step not yet implemented" };
  }

  private async waitForPageInput(
    runId: string,
    step: Step,
    stepIndex: number,
  ): Promise<Record<string, unknown>> {
    await this.runModel
      .updateOne(
        { _id: runId },
        {
          $set: {
            status: RunStatus.WAITING_INPUT,
            currentStep: stepIndex,
          },
        },
      )
      .exec();

    await this.publish(runId, {
      type: "page:required",
      runId,
      payload: {
        stepIndex,
        stepTitle: step.title,
        page: step.page,
      },
      timestamp: new Date().toISOString(),
    });

    const deadline = Date.now() + PAGE_INPUT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const run = await this.runModel.findById(runId).exec();
      if (!run) {
        throw new StepExecutionError("Run disappeared while waiting for input");
      }
      if (run.status === RunStatus.CANCELLED) {
        throw new RunCancelledError("Run was cancelled while waiting for input");
      }
      if (run.status === RunStatus.RUNNING && run.pageData) {
        const data = run.pageData as Record<string, unknown>;
        await this.runModel
          .updateOne({ _id: runId }, { $unset: { pageData: "" } })
          .exec();
        return data;
      }
      await this.sleep(1000);
    }

    throw new StepExecutionError("Timed out waiting for page input");
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
