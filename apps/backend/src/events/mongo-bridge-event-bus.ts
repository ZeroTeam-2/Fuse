import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import type { NotificationNewPayload, ServerWsEvent } from "@fuse/shared";
import type { EventBus } from "./event-bus";
import {
  BRIDGE_COLLECTION,
  BRIDGE_SEED_NS,
  BRIDGE_SIZE_BYTES,
  type BridgeEnvelope,
  type BridgeNamespace,
} from "./bridge.constants";

/** Mongo-код «коллекция уже существует» — при гонке создания это не ошибка. */
const NAMESPACE_EXISTS = 48;

/**
 * Реализация для воркер-процесса: сокетов у него нет, поэтому событие
 * уезжает конвертом в capped-коллекцию, откуда его забирает `BridgeTailer`
 * API-процесса.
 *
 * Публикация никогда не бросает: мост доставляет «живость», а истина уже
 * сохранена в `Run` до вызова (см. design, D1). Упавшая вставка конверта не
 * должна ронять исполнение шага.
 */
@Injectable()
export class MongoBridgeEventBus implements EventBus, OnApplicationBootstrap {
  private readonly logger = new Logger(MongoBridgeEventBus.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await ensureBridgeCollection(this.connection, this.logger);
  }

  async publishRun(runId: string, event: ServerWsEvent): Promise<void> {
    await this.insert("runs", runId, event.type, event);
  }

  async publishNotification(
    userId: string,
    payload: NotificationNewPayload,
  ): Promise<void> {
    await this.insert("notifications", userId, "notification:new", payload);
  }

  private async insert(
    ns: BridgeNamespace,
    room: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    const envelope: BridgeEnvelope = {
      ns,
      room,
      event,
      payload,
      createdAt: new Date(),
    };

    try {
      await this.connection
        .collection<BridgeEnvelope>(BRIDGE_COLLECTION)
        .insertOne(envelope);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to publish ${event} for ${ns}/${room}: ${reason}`,
      );
    }
  }
}

/**
 * Идемпотентно готовит capped-коллекцию моста: создаёт её и сид-конверт.
 *
 * Вызывается обоими процессами при старте. Проверка через `listCollections`,
 * а не «создать и поймать `NamespaceExists`»: MongoDB на повторный `create` с
 * теми же опциями отвечает `ok: 1` (ошибку даёт только при расхождении
 * опций), поэтому ловушка на код 48 не удержала бы сид от вставки на каждый
 * старт процесса. Сам `NamespaceExists` всё равно обрабатывается — на случай
 * проигранной гонки между проверкой и созданием.
 *
 * Сид нужен потому, что tailable cursor не открывается на пустой коллекции.
 */
export async function ensureBridgeCollection(
  connection: Connection,
  logger: Logger,
): Promise<void> {
  const db = connection.db;
  if (!db) {
    logger.warn("Mongo connection has no db — bridge collection not ensured");
    return;
  }

  const seed = (): BridgeEnvelope => ({
    ns: BRIDGE_SEED_NS,
    room: "",
    event: "bridge:seed",
    payload: null,
    createdAt: new Date(),
  });

  try {
    const existing = await db
      .listCollections({ name: BRIDGE_COLLECTION }, { nameOnly: true })
      .toArray();

    if (existing.length > 0) {
      // Коллекция на месте. Пустой она быть не должна, но если осталась без
      // документов (например, после ручной пересборки), курсор на ней не
      // откроется — возвращаем сид.
      const collection = db.collection<BridgeEnvelope>(BRIDGE_COLLECTION);
      if ((await collection.countDocuments({}, { limit: 1 })) === 0) {
        await collection.insertOne(seed());
      }
      return;
    }

    await db.createCollection(BRIDGE_COLLECTION, {
      capped: true,
      size: BRIDGE_SIZE_BYTES,
    });
    await db.collection<BridgeEnvelope>(BRIDGE_COLLECTION).insertOne(seed());

    logger.log(`Created capped collection ${BRIDGE_COLLECTION}`);
  } catch (err) {
    if ((err as { code?: number })?.code === NAMESPACE_EXISTS) {
      return;
    }
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to ensure ${BRIDGE_COLLECTION}: ${reason}`);
  }
}
