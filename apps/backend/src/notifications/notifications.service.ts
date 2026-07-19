import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type {
  NotificationType,
  PaginatedResponse,
  RunNotification,
} from "@fuse/shared";
import { Notification, NotificationDocument } from "./notification.schema";
import { NotificationsGateway } from "./notifications.gateway";
import { Run, RunDocument } from "../execution/run.schema";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";

const DUPLICATE_KEY = 11000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(Run.name) private readonly runModel: Model<RunDocument>,
    @InjectModel(Scenario.name)
    private readonly scenarioModel: Model<ScenarioDocument>,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Уведомление о переходе запуска. Вызывается воркером и сервисом исполнения;
   * никогда не бросает — упавшее уведомление не должно ронять сам запуск.
   * Повторная доставка того же перехода гасится уникальным индексом
   * `{runId, type, stepIndex}` на уровне Mongo, а не проверкой в коде.
   */
  async notifyRunEvent(
    runId: string,
    type: NotificationType,
    stepIndex?: number,
  ): Promise<void> {
    try {
      const run = await this.runModel.findById(runId).exec();
      if (!run) {
        return;
      }

      const scenario = await this.scenarioModel
        .findById(run.scenarioId)
        .exec();

      const doc = await this.notificationModel.create({
        userId: run.userId,
        runId,
        scenarioId: run.scenarioId,
        scenarioTitle: scenario?.title ?? "Сценарий удалён",
        type,
        ...(stepIndex !== undefined ? { stepIndex } : {}),
        read: false,
      });

      const unreadCount = await this.notificationModel
        .countDocuments({ userId: run.userId, read: false })
        .exec();

      this.gateway.emitNew(run.userId, {
        notification: this.toDto(doc),
        unreadCount,
      });
    } catch (err) {
      if ((err as { code?: number })?.code === DUPLICATE_KEY) {
        return;
      }
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to notify for run ${runId}: ${reason}`);
    }
  }

  async listForUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponse<RunNotification>> {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this.notificationModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments({ userId }).exec(),
    ]);

    return {
      data: docs.map((doc) => this.toDto(doc)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async unreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notificationModel
      .countDocuments({ userId, read: false })
      .exec();
    return { unreadCount };
  }

  async markRead(id: string, userId: string): Promise<void> {
    const result = await this.notificationModel
      .updateOne({ _id: id, userId }, { $set: { read: true } })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Notification #${id} not found`);
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationModel
      .updateMany({ userId, read: false }, { $set: { read: true } })
      .exec();
  }

  /** Каскад удаления запуска: его уведомления уходят вместе с ним. */
  async deleteForRun(runId: string): Promise<void> {
    await this.notificationModel.deleteMany({ runId }).exec();
  }

  private toDto(doc: NotificationDocument): RunNotification {
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      runId: doc.runId,
      scenarioId: doc.scenarioId,
      scenarioTitle: doc.scenarioTitle,
      type: doc.type,
      read: doc.read,
      createdAt: doc.createdAt?.toISOString?.() ?? String(doc.createdAt),
      updatedAt: doc.updatedAt?.toISOString?.() ?? String(doc.updatedAt),
    };
  }
}
