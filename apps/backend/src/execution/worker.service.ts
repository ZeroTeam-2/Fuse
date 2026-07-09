import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Worker, Job } from "bullmq";
import type { ConnectionOptions } from "bullmq";
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
import { RedisPubSubService } from "./redis-pubsub.service";
import { resolveMappings } from "./mapping-resolver";
import { SCENARIO_EXECUTION_QUEUE } from "./execution.service";

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const PAGE_INPUT_TIMEOUT_MS = 30 * 60 * 1000;

interface StepContext {
  runId: string;
  stepIndex: number;
  stepResults: RunStepResult[];
}

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private worker: Worker | null = null;

  constructor(
    @InjectModel(Run.name) private readonly runModel: Model<RunDocument>,
    @InjectModel(Scenario.name)
    private readonly scenarioModel: Model<ScenarioDocument>,
    private readonly configService: ConfigService,
    private readonly pubsub: RedisPubSubService,
  ) {}

  start(): void {
    if (this.worker) {
      return;
    }

    const url = this.configService.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    const connection: ConnectionOptions = { url };

    this.worker = new Worker(
      SCENARIO_EXECUTION_QUEUE,
      async (job: Job) => {
        const { runId } = job.data as { runId: string };
        await this.executeRun(runId, job.attemptsMade);
      },
      {
        connection,
        concurrency: 5,
      },
    );

    this.worker.on("completed", (job) => {
      this.logger.log(`Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log("Worker started — processing scenario execution jobs");
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  private async publish(runId: string, event: ServerWsEvent): Promise<void> {
    await this.pubsub.publish(runId, event);
  }

  private async pushRunStep(
    runId: string,
    stepResult: RunStepResult,
  ): Promise<void> {
    await this.runModel
      .updateOne(
        { _id: runId },
        { $push: { stepResults: stepResult as never } },
      )
      .exec();
  }

  private async setRunStep(
    runId: string,
    stepIndex: number,
    update: RunStepResult,
  ): Promise<void> {
    await this.runModel
      .updateOne(
        { _id: runId, "stepResults.stepIndex": stepIndex },
        { $set: { "stepResults.$": update as never } },
      )
      .exec();
  }

  private async executeRun(runId: string, _attemptsMade: number): Promise<void> {
    const run = await this.runModel.findById(runId).exec();
    if (!run) {
      this.logger.error(`Run ${runId} not found`);
      return;
    }

    if (run.status === RunStatus.CANCELLED) {
      this.logger.log(`Run ${runId} is cancelled, skipping`);
      return;
    }

    const scenario = await this.scenarioModel
      .findById(run.scenarioId)
      .exec();

    if (!scenario) {
      await this.failRun(runId, "Scenario not found");
      return;
    }

    const steps = (scenario.steps ?? []) as Step[];
    const startStep = run.currentStep ?? 0;

    await this.runModel
      .updateOne(
        { _id: runId },
        { $set: { status: RunStatus.RUNNING } },
      )
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

      const stepResult: RunStepResult = {
        stepIndex: i,
        stepTitle: step.title,
        status: "running",
        startedAt,
      };

      await this.pushRunStep(runId, stepResult);

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
        };

        const result = await this.executeStep(step, ctx);

        const finishedAt = new Date().toISOString();
        const durationMs =
          new Date(finishedAt).getTime() - new Date(startedAt).getTime();

        const completedStep: RunStepResult = {
          stepIndex: i,
          stepTitle: step.title,
          status: "completed",
          result,
          startedAt,
          finishedAt,
          durationMs,
        };

        await this.setRunStep(runId, i, completedStep);

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
        const error = err instanceof Error ? err.message : String(err);
        const finishedAt = new Date().toISOString();

        await this.setRunStep(runId, i, {
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
        throw err;
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

    await this.publish(runId, {
      type: "run:done",
      runId,
      payload: {
        totalDurationMs: 0,
        results: (finalRun?.stepResults ?? []).map((sr) => sr.result),
      },
      timestamp: new Date().toISOString(),
    });

    await this.publish(runId, {
      type: "run:status",
      runId,
      payload: {
        status: RunStatus.COMPLETED,
        currentStep: steps.length,
        stepResults: finalRun?.stepResults ?? [],
      },
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Run ${runId} completed successfully`);
  }

  private async executeStep(step: Step, ctx: StepContext): Promise<unknown> {
    if (step.page) {
      await this.waitForPageInput(ctx.runId, step, ctx.stepIndex);
    }

    switch (step.type) {
      case "api":
        return this.executeApiStep(step, ctx.stepResults);

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

  private async executeApiStep(
    step: ApiStep,
    stepResults: RunStepResult[],
  ): Promise<unknown> {
    const resolved = resolveMappings(step, stepResults);
    const url = this.buildUrl(step.path, resolved);

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

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `API call failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  private buildUrl(
    path: string,
    resolved: Record<string, unknown>,
  ): string {
    let url = path;

    const pathParams = this.toRecord(resolved.path);
    if (pathParams) {
      for (const [key, value] of Object.entries(pathParams)) {
        url = url.replace(`{${key}}`, String(value));
      }
    }

    const queryParams = this.toRecord(resolved.query);
    if (queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) {
        url += `?${qs}`;
      }
    }

    return url;
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
    const resolved = resolveMappings(step, ctx.stepResults);
    const url = this.buildUrl(step.pollPath, resolved);
    const intervalMs = (step.pollIntervalSec ?? 5) * 1000;
    const progressField = step.progressField;
    const startTime = Date.now();

    let lastResult: unknown = null;

    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      const run = await this.runModel.findById(ctx.runId).exec();
      if (!run || run.status === RunStatus.CANCELLED) {
        throw new Error("Run was cancelled");
      }

      const response = await fetch(url, { method: step.pollMethod });

      if (!response.ok) {
        throw new Error(
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
      throw new Error(`Referenced scenario ${step.refScenarioId} not found`);
    }

    const refSteps = (refScenario.steps ?? []) as Step[];
    const nestedResults: RunStepResult[] = [];

    for (let i = 0; i < refSteps.length; i++) {
      const refStep = refSteps[i];
      const nestedCtx: StepContext = {
        runId: ctx.runId,
        stepIndex: i,
        stepResults: nestedResults,
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
        throw new Error("Run disappeared while waiting for input");
      }
      if (run.status === RunStatus.CANCELLED) {
        throw new Error("Run was cancelled while waiting for input");
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

    throw new Error("Timed out waiting for page input");
  }

  private async failRun(runId: string, error: string): Promise<void> {
    await this.runModel
      .updateOne(
        { _id: runId },
        { $set: { status: RunStatus.FAILED, error } },
      )
      .exec();

    const run = await this.runModel.findById(runId).exec();

    await this.publish(runId, {
      type: "run:status",
      runId,
      payload: {
        status: RunStatus.FAILED,
        currentStep: run?.currentStep ?? 0,
        stepResults: run?.stepResults ?? [],
      },
      timestamp: new Date().toISOString(),
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
