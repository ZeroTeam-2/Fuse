import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { RunStatus } from "@fuse/shared";
import { Run, RunDocument } from "./run.schema";

export const SCENARIO_EXECUTION_QUEUE = "scenario-execution";

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly queue: Queue;

  constructor(
    @InjectModel(Run.name) private readonly runModel: Model<RunDocument>,
    private readonly configService: ConfigService,
  ) {
    const url =
      this.configService.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    const connection: ConnectionOptions = { url };
    this.queue = new Queue(SCENARIO_EXECUTION_QUEUE, { connection });
  }

  async createRun(userId: string, scenarioId: string): Promise<RunDocument> {
    const run = await new this.runModel({
      scenarioId,
      userId,
      status: RunStatus.PENDING,
      stepResults: [],
      currentStep: 0,
    }).save();

    await this.queue.add("execute", { runId: run._id.toString() }, { jobId: run._id.toString() });

    this.logger.log(`Created run ${run._id} for scenario ${scenarioId}`);
    return run;
  }

  async getRun(runId: string): Promise<RunDocument> {
    const run = await this.runModel.findById(runId).exec();
    if (!run) {
      throw new NotFoundException(`Run #${runId} not found`);
    }
    return run;
  }

  async cancelRun(runId: string): Promise<RunDocument> {
    const run = await this.runModel.findById(runId).exec();
    if (!run) {
      throw new NotFoundException(`Run #${runId} not found`);
    }

    if (
      run.status === RunStatus.COMPLETED ||
      run.status === RunStatus.FAILED ||
      run.status === RunStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel run in status ${run.status}`,
      );
    }

    const updated = await this.runModel
      .findByIdAndUpdate(
        runId,
        { $set: { status: RunStatus.CANCELLED } },
        { new: true },
      )
      .exec();

    const job = await this.queue.getJob(runId);
    if (job) {
      await job.remove();
    }

    return updated!;
  }

  async submitPageData(
    runId: string,
    stepIndex: number,
    data: Record<string, unknown>,
  ): Promise<RunDocument> {
    const run = await this.runModel.findById(runId).exec();
    if (!run) {
      throw new NotFoundException(`Run #${runId} not found`);
    }

    if (run.status !== RunStatus.WAITING_INPUT) {
      throw new BadRequestException(
        `Run is not waiting for input (status: ${run.status})`,
      );
    }

    if (run.currentStep !== stepIndex) {
      throw new BadRequestException(
        `Step ${stepIndex} is not the current step`,
      );
    }

    const updated = await this.runModel
      .findByIdAndUpdate(
        runId,
        {
          $set: {
            pageData: data,
            status: RunStatus.RUNNING,
          },
        },
        { new: true },
      )
      .exec();

    return updated!;
  }
}
