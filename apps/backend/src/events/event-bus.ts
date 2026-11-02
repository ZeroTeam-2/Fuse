import type { NotificationNewPayload, ServerWsEvent } from "@fuse/shared";

/**
 * Публикация WS-событий, одинаковая для обоих процессов бэкенда.
 *
 * Потребители (`WorkerService`, `ExecutionService`, `NotificationsService`) не
 * знают, доедет ли событие до сокета напрямую в памяти или через мост в Mongo:
 * API-процесс держит сокеты и получает `LocalEventBus`, воркер-процесс сокетов
 * не держит и получает `MongoBridgeEventBus`. Выбор реализации — за
 * `EventsModule.forApi()` / `EventsModule.forWorker()`.
 */
export interface EventBus {
  /** Событие исполнения — в комнату запуска (`run:{runId}` namespace `runs`). */
  publishRun(runId: string, event: ServerWsEvent): Promise<void> | void;

  /** Уведомление колокольчика — в личную комнату (`user:{userId}`). */
  publishNotification(
    userId: string,
    payload: NotificationNewPayload,
  ): Promise<void> | void;
}

/** DI-токен шины: интерфейс стирается при компиляции, инжектить его нельзя. */
export const EVENT_BUS = Symbol("EVENT_BUS");
