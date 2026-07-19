import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { RunStatus, isUploadedFileRef } from "@fuse/shared";
import type {
  PaginatedResponse,
  RunFileRef,
  RunListItem,
  Step,
} from "@fuse/shared";
import { Run, RunDocument } from "./run.schema";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";
import { RunGateway } from "../websocket/run.gateway";
import { MinioService } from "../minio/minio.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ManualInputsService } from "./manual-inputs.service";
import { missingRequiredKeys } from "./manual-inputs";

const TERMINAL_RUN_STATUSES: RunStatus[] = [
  RunStatus.COMPLETED,
  RunStatus.FAILED,
  RunStatus.CANCELLED,
];

/**
 * Файловые ссылки среди значений ввода (значение целиком или элемент массива).
 * Всё найденное регистрируется в `Run.files` — реестре для каскадного удаления
 * объектов S3 вместе с запуском.
 */
function collectFileRefs(
  values: Record<string, unknown> | undefined,
): RunFileRef[] {
  if (!values) return [];
  const refs: RunFileRef[] = [];
  for (const value of Object.values(values)) {
    if (isUploadedFileRef(value)) {
      refs.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isUploadedFileRef(item)) refs.push(item);
      }
    }
  }
  return refs;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;

  constructor(
    @InjectModel(Run.name) private readonly runModel: Model<RunDocument>,
    @InjectModel(Scenario.name)
    private readonly scenarioModel: Model<ScenarioDocument>,
    private readonly configService: ConfigService,
    private readonly gateway: RunGateway,
    private readonly manualInputsService: ManualInputsService,
    private readonly minioService: MinioService,
    private readonly notificationsService: NotificationsService,
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

  async createRun(
    userId: string,
    scenarioId: string,
    inputs?: Record<string, unknown>,
  ): Promise<RunDocument> {
    const scenario = await this.scenarioModel.findById(scenarioId).exec();
    if (!scenario) {
      throw new NotFoundException(`Scenario #${scenarioId} not found`);
    }

    // Сценарий заблокирован, потому что один из шагов ссылается на удалённое
    // приложение (см. `AppsService.delete`) — запускать его нет смысла, шаг
    // всё равно упадёт на отсутствующем appId.
    if (scenario.blocked) {
      throw new BadRequestException(
        scenario.blockedReason ??
          "Сценарий заблокирован: один из шагов ссылается на удалённый API. Исправьте или удалите этот шаг, чтобы запустить сценарий снова.",
      );
    }

    // Программный запуск без обязательного значения ручного ввода не должен
    // молча висеть 30 минут в `waiting_input` — это та же болезнь, что тихая
    // пустая подстановка. UI сюда не доводит: кнопка запуска заблокирована.
    const descriptors = await this.manualInputsService.forSteps(
      (scenario.steps ?? []) as Step[],
      scenarioId,
    );
    const missing = missingRequiredKeys(descriptors, inputs);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Не заданы обязательные значения ручного ввода: ${missing.join(", ")}`,
      );
    }

    const run = await new this.runModel({
      scenarioId,
      userId,
      status: RunStatus.PENDING,
      stepResults: [],
      currentStep: 0,
      inputs: inputs ?? {},
      // Загруженные во входах файлы — сразу в реестр файлов запуска.
      files: collectFileRefs(inputs),
    }).save();

    await this.enqueueRun(run._id.toString());

    this.logger.log(`Created run ${run._id} for scenario ${scenarioId}`);
    return run;
  }

  /**
   * Кладёт сообщение о запуске в очередь. Используется и для старта, и для
   * ПРОДОЛЖЕНИЯ после ввода пользователя: воркер не держит обработчик, пока ждёт
   * страницу/добор, а поднимает исполнение заново с текущего шага по этому
   * сообщению (пришедший ввод лежит в `Run.pendingInput`/`Run.inputs`).
   */
  private async enqueueRun(runId: string): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({ runId }),
      }),
    );
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

  async cancelRun(runId: string, userId: string): Promise<RunDocument> {
    const run = await this.getRun(runId, userId);

    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
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

    await this.publishCancelled(updated!);
    await this.notificationsService.notifyRunEvent(runId, "run_cancelled");

    return updated!;
  }

  /**
   * Отменяет все незавершённые запуски для набора сценариев. Вызывается при
   * удалении сценария/приложения — воркер проверяет `status === CANCELLED`
   * между шагами (и во время поллинга/ожидания страницы), поэтому уже
   * запущенные `Run`ы реально останавливаются, а не продолжают висеть в фоне
   * после того, как сценарий/приложение исчезли из базы.
   */
  async cancelActiveRunsForScenarios(scenarioIds: string[]): Promise<number> {
    if (scenarioIds.length === 0) {
      return 0;
    }

    const activeRuns = await this.runModel
      .find({
        scenarioId: { $in: scenarioIds },
        status: { $nin: TERMINAL_RUN_STATUSES },
      })
      .exec();

    if (activeRuns.length === 0) {
      return 0;
    }

    await this.runModel
      .updateMany(
        { _id: { $in: activeRuns.map((run) => run._id) } },
        { $set: { status: RunStatus.CANCELLED } },
      )
      .exec();

    await Promise.all(activeRuns.map((run) => this.publishCancelled(run)));
    await Promise.all(
      activeRuns.map((run) =>
        this.notificationsService.notifyRunEvent(
          run._id.toString(),
          "run_cancelled",
        ),
      ),
    );

    this.logger.log(
      `Cancelled ${activeRuns.length} active run(s) for scenario(s): ${scenarioIds.join(", ")}`,
    );

    return activeRuns.length;
  }

  private async publishCancelled(run: RunDocument): Promise<void> {
    this.gateway.publish(run._id.toString(), {
      type: "run:status",
      runId: run._id.toString(),
      payload: {
        status: RunStatus.CANCELLED,
        currentStep: run.currentStep ?? 0,
        stepResults: run.stepResults ?? [],
      },
      timestamp: new Date().toISOString(),
    });
  }

  async submitPageData(
    runId: string,
    userId: string,
    stepIndex: number,
    data: Record<string, unknown>,
  ): Promise<RunDocument> {
    await this.assertWaitingForStep(runId, userId, stepIndex);

    const fileRefs = collectFileRefs(data);
    const updated = await this.runModel
      .findByIdAndUpdate(
        runId,
        {
          $set: {
            pendingInput: { stepIndex, data },
            status: RunStatus.RUNNING,
          },
          // Загруженные на странице файлы — в реестр файлов запуска.
          ...(fileRefs.length
            ? { $push: { files: { $each: fileRefs } } }
            : {}),
        },
        { new: true },
      )
      .exec();

    // Воркер отпустил обработчик, уйдя в ожидание, — поднимаем продолжение
    // отдельным сообщением.
    await this.enqueueRun(runId);

    return updated!;
  }

  /**
   * Значения добора приходят по скоуп-ключам (`s2:inn`) и дописываются в
   * `Run.inputs`: после перезапуска воркера они уже там, и повторно их никто
   * не спросит. `pendingInput` здесь — только сигнал «ввод пришёл».
   */
  async submitInputs(
    runId: string,
    userId: string,
    stepIndex: number,
    values: Record<string, unknown>,
  ): Promise<RunDocument> {
    const run = await this.assertWaitingForStep(runId, userId, stepIndex);

    const fileRefs = collectFileRefs(values);
    const updated = await this.runModel
      .findByIdAndUpdate(
        runId,
        {
          $set: {
            inputs: { ...(run.inputs ?? {}), ...values },
            pendingInput: { stepIndex, data: values },
            status: RunStatus.RUNNING,
          },
          ...(fileRefs.length
            ? { $push: { files: { $each: fileRefs } } }
            : {}),
        },
        { new: true },
      )
      .exec();

    // Продолжение исполнения — отдельным сообщением (воркер не ждёт в обработчике).
    await this.enqueueRun(runId);

    return updated!;
  }

  private async assertWaitingForStep(
    runId: string,
    userId: string,
    stepIndex: number,
  ): Promise<RunDocument> {
    // Владельца проверяет getRun: чужой запуск нельзя ни продолжить, ни отменить.
    const run = await this.getRun(runId, userId);

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

    return run;
  }

  /**
   * История запусков пользователя. Тяжёлые поля (`result` шагов, `inputs`,
   * ящики ввода) в выборку не входят: результаты бывают большими, а списку
   * нужны только статус и прогресс. Названия сценариев батчатся одним
   * запросом, а не хранятся в `Run` — иначе рассинхрон при переименовании.
   */
  async listRuns(
    userId: string,
    page = 1,
    limit = 20,
    statuses?: RunStatus[],
  ): Promise<PaginatedResponse<RunListItem>> {
    const filter = {
      userId,
      ...(statuses?.length ? { status: { $in: statuses } } : {}),
    };
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      this.runModel
        .find(filter)
        .select("-stepResults.result -inputs -pendingInput -pageData -files -finalPage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.runModel.countDocuments(filter).exec(),
    ]);

    const scenarioIds = [...new Set(runs.map((run) => run.scenarioId))];
    const scenarios = scenarioIds.length
      ? await this.scenarioModel
          .find({ _id: { $in: scenarioIds } })
          .select("title steps")
          .exec()
      : [];
    const scenarioById = new Map(
      scenarios.map((scenario) => [scenario._id.toString(), scenario]),
    );

    const data: RunListItem[] = runs.map((run) => {
      const scenario = scenarioById.get(run.scenarioId);
      const doc = run as RunDocument & { createdAt?: Date; updatedAt?: Date };
      return {
        id: run._id.toString(),
        scenarioId: run.scenarioId,
        scenarioTitle: scenario?.title ?? "Сценарий удалён",
        status: run.status,
        currentStep: run.currentStep ?? 0,
        // До инициализации результатов воркером (`pending`) длина
        // `stepResults` ещё 0 — берём число шагов из сценария.
        totalSteps:
          run.stepResults?.length || (scenario?.steps?.length ?? 0),
        ...(run.error ? { error: run.error } : {}),
        createdAt: doc.createdAt?.toISOString() ?? "",
        updatedAt: doc.updatedAt?.toISOString() ?? "",
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  /**
   * Удаление запуска из истории — безвозвратное: вместе с документом стираются
   * все связанные объекты S3 (реестр `files`) и уведомления. Активный запуск
   * удалить нельзя — сначала отмена, иначе воркер продолжит писать в удалённый
   * документ. Ошибка удаления отдельного объекта S3 (например, уже отсутствует)
   * каскад не прерывает: документ жив до конца каскада, повтор удаления доберёт
   * остальное.
   */
  async deleteRun(runId: string, userId: string): Promise<void> {
    const run = await this.getRun(runId, userId);

    if (!TERMINAL_RUN_STATUSES.includes(run.status)) {
      throw new ConflictException(
        `Нельзя удалить запуск в статусе ${run.status} — сначала отмените его`,
      );
    }

    for (const file of run.files ?? []) {
      try {
        await this.minioService.deleteFile(file.objectName);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to delete S3 object ${file.objectName} for run ${runId}: ${reason}`,
        );
      }
    }

    await this.notificationsService.deleteForRun(runId);
    await this.runModel.deleteOne({ _id: runId }).exec();

    this.logger.log(`Deleted run ${runId} with ${run.files?.length ?? 0} file(s)`);
  }

  /**
   * Presigned-ссылка на файл запуска. `objectName` обязан числиться в реестре
   * файлов запуска: endpoint не должен превращаться в выдачу произвольных
   * объектов бакета по имени.
   */
  async getFileLink(
    runId: string,
    userId: string,
    objectName: string,
  ): Promise<{ url: string; fileName: string }> {
    const run = await this.getRun(runId, userId);

    const file = (run.files ?? []).find(
      (ref) => ref.objectName === objectName,
    );
    if (!file) {
      throw new NotFoundException(
        `File ${objectName} is not registered for run #${runId}`,
      );
    }

    const url = await this.minioService.getPresignedUrl(objectName);
    return { url, fileName: file.fileName };
  }
}
