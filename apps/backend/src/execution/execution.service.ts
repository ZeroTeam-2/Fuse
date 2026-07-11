import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { RunStatus } from "@fuse/shared";
import { Run, RunDocument } from "./run.schema";

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;

  constructor(
    @InjectModel(Run.name) private readonly runModel: Model<RunDocument>,
    private readonly configService: ConfigService,
  ) {
    const endpoint = this.configService.get<string>("AWS_ENDPOINT_URL");
    const region = this.configService.get<string>("AWS_REGION") ?? "us-east-1";
    const accessKeyId = this.configService.get<string>("AWS_ACCESS_KEY_ID") ?? "test";
    const secretAccessKey = this.configService.get<string>("AWS_SECRET_ACCESS_KEY") ?? "test";

    this.sqsClient = new SQSClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpoint ? { endpoint } : {}),
    });
    this.queueUrl = this.configService.get<string>("AWS_SQS_QUEUE_URL")!;
  }

  async createRun(userId: string, scenarioId: string): Promise<RunDocument> {
    const run = await new this.runModel({
      scenarioId,
      userId,
      status: RunStatus.PENDING,
      stepResults: [],
      currentStep: 0,
    }).save();

    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({ runId: run._id.toString() }),
      }),
    );

    this.logger.log(`Created run ${run._id} for scenario ${scenarioId}`);
    return run;
  }

  /**
   * @param userId владелец запуска; чужой `Run` читать нельзя. Эндпоинт стал
   * опорным для восстановления состояния, так что проверка здесь обязательна.
   */
  async getRun(runId: string, userId: string): Promise<RunDocument> {
    const run = await this.runModel.findById(runId).exec();
    if (!run) {
      throw new NotFoundException(`Run #${runId} not found`);
    }
    if (run.userId !== userId) {
      throw new ForbiddenException(`Run #${runId} belongs to another user`);
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
