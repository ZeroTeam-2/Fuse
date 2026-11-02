import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import type { NotificationNewPayload } from "@fuse/shared";
import { LocalEventBus } from "./local-event-bus";
import { ensureBridgeCollection } from "./mongo-bridge-event-bus";
import {
  BRIDGE_COLLECTION,
  BRIDGE_RETRY_BASE_MS,
  BRIDGE_RETRY_MAX_MS,
  BRIDGE_SEED_NS,
  type BridgeEnvelope,
} from "./bridge.constants";

/**
 * Читающая сторона моста: живёт в API-процессе, тейлит capped-коллекцию и
 * пересылает конверты воркера в socket.io-комнаты через `LocalEventBus`.
 *
 * Курсор смертен (обрезка капа, реконнект к Mongo, рестарт базы), поэтому
 * тело — вечный цикл «открыть курсор → читать → упал → подождать → открыть
 * заново» с экспоненциальным бэкоффом. Потеря конвертов на пересоздании
 * некритична: `RunGateway` отдаёт снапшот `Run` при каждом подключении
 * клиента, а состояние персистится до публикации события (design, D1).
 */
@Injectable()
export class BridgeTailer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BridgeTailer.name);
  private stopped = false;
  private loop: Promise<void> | null = null;
  /** Таймер бэкоффа — его надо снять при шатдауне, иначе процесс не выйдет. */
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly bus: LocalEventBus,
  ) {}

  onApplicationBootstrap(): void {
    // Цикл не ждём: он бесконечный, иначе бутстрап приложения не завершится.
    this.loop = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await this.loop?.catch(() => undefined);
  }

  private async run(): Promise<void> {
    await ensureBridgeCollection(this.connection, this.logger);

    let backoff = BRIDGE_RETRY_BASE_MS;

    while (!this.stopped) {
      try {
        await this.tail();
        // Курсор закрылся без ошибки (обрезка капа) — открываем заново сразу.
        backoff = BRIDGE_RETRY_BASE_MS;
      } catch (err) {
        if (this.stopped) {
          return;
        }
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Bridge tail cursor died: ${reason}`);
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, BRIDGE_RETRY_MAX_MS);
      }
    }
  }

  /**
   * Один проход курсора. Стартуем от последнего `_id`, а не с начала капа:
   * иначе каждое пересоздание переигрывало бы всю историю коллекции заново.
   */
  private async tail(): Promise<void> {
    const db = this.connection.db;
    if (!db) {
      throw new Error("Mongo connection has no db");
    }

    const collection = db.collection<BridgeEnvelope>(BRIDGE_COLLECTION);

    const last = await collection
      .find({})
      .sort({ $natural: -1 })
      .limit(1)
      .next();

    const cursor = collection.find(
      last ? { _id: { $gt: last._id } } : {},
      { tailable: true, awaitData: true, noCursorTimeout: true },
    );

    try {
      while (!this.stopped) {
        const envelope = await cursor.next();
        if (!envelope) {
          // Курсор исчерпан и не tailable-живой — выходим на пересоздание.
          return;
        }
        this.dispatch(envelope);
      }
    } finally {
      await cursor.close().catch(() => undefined);
    }
  }

  private dispatch(envelope: BridgeEnvelope): void {
    if (envelope.ns === BRIDGE_SEED_NS) {
      return;
    }

    try {
      if (envelope.ns === "runs") {
        this.bus.emitRaw(envelope.room, envelope.event, envelope.payload);
        return;
      }

      if (envelope.ns === "notifications") {
        this.bus.publishNotification(
          envelope.room,
          envelope.payload as NotificationNewPayload,
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to dispatch ${envelope.event} to ${envelope.ns}/${envelope.room}: ${reason}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.retryTimer = setTimeout(resolve, ms);
    });
  }
}
