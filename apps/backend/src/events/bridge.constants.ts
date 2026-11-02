/**
 * Мост событий воркер → API поверх capped-коллекции MongoDB.
 *
 * Почему не `@socket.io/mongo-adapter`: он работает только через change
 * streams, а те требуют replica set — дев-Mongo standalone, статус прод-базы
 * не гарантирован. Capped-коллекция + tailable cursor работают на standalone.
 */

/** Capped-коллекция конвертов. Старые документы вытесняются сами — TTL не нужен. */
export const BRIDGE_COLLECTION = "ws_events_bridge";

/**
 * Размер капа. События живут секунды (их читают немедленно), поэтому миллиона
 * байт с запасом хватает на пик; переполнение вытесняет уже доставленное.
 */
export const BRIDGE_SIZE_BYTES = 1024 * 1024;

/**
 * Tailable cursor не открывается на пустой коллекции, поэтому при создании
 * вставляется сид-конверт. Его `ns` не совпадает ни с одним реальным — тейлер
 * такие конверты молча пропускает.
 */
export const BRIDGE_SEED_NS = "seed";

/** Пауза перед пересозданием умершего курсора (обрезка капа, реконнект). */
export const BRIDGE_RETRY_BASE_MS = 200;
export const BRIDGE_RETRY_MAX_MS = 5_000;

/** namespace socket.io, которому адресован конверт. */
export type BridgeNamespace = "runs" | "notifications";

/**
 * Конверт моста. `room` — идентификатор комнаты БЕЗ префикса namespace:
 * для `runs` это `runId` (гейтвей сам соберёт `run:{runId}`), для
 * `notifications` — `userId` (комната `user:{userId}`).
 */
export interface BridgeEnvelope {
  ns: BridgeNamespace | typeof BRIDGE_SEED_NS;
  room: string;
  event: string;
  payload: unknown;
  createdAt: Date;
}
