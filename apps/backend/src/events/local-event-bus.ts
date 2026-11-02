import { Injectable } from "@nestjs/common";
import type { NotificationNewPayload, ServerWsEvent } from "@fuse/shared";
import { RunGateway } from "../websocket/run.gateway";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import type { EventBus } from "./event-bus";

/**
 * Реализация для API-процесса: сокеты клиентов подключены сюда, поэтому
 * событие отдаётся гейтвею напрямую в памяти — как было до разделения
 * процессов. Сюда же `BridgeTailer` сдаёт конверты, пришедшие от воркера.
 */
@Injectable()
export class LocalEventBus implements EventBus {
  constructor(
    private readonly runGateway: RunGateway,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  publishRun(runId: string, event: ServerWsEvent): void {
    this.runGateway.publish(runId, event);
  }

  publishNotification(userId: string, payload: NotificationNewPayload): void {
    this.notificationsGateway.emitNew(userId, payload);
  }

  /**
   * Трансляция произвольного конверта моста. Отдельно от `publishRun`: оттуда
   * имя события выводится из `event.type`, а здесь оно пришло из конверта как
   * есть, и типизированного `ServerWsEvent` у тейлера на руках нет.
   */
  emitRaw(runId: string, event: string, payload: unknown): void {
    this.runGateway.emitToRun(runId, event, payload);
  }
}
