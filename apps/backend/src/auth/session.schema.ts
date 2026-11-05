import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type SessionDocument = HydratedDocument<Session>;

/**
 * Имя коллекции (Mongoose выводит его из имени класса). Нужно явной строкой:
 * проверка сессии в `JwtStrategy` идёт одним запросом через `$lookup` из
 * коллекции пользователей, а `$lookup` принимает именно имя коллекции.
 */
export const SESSION_COLLECTION = "sessions";

/**
 * Сессия — запись о выданной паре токенов.
 *
 * Без неё refresh-токен нельзя ни отозвать, ни заметить его повторное
 * использование: подписанный JWT действителен до истечения срока, и «выйти»
 * означало бы лишь удалить куку у того, кто вышел. Access-токен несёт `sId`
 * этой записи, поэтому отзыв сессии прекращает и его действие.
 */
// Тип каждого поля задан в @Prop явно: без него схема собирается из метаданных
// компилятора, а они есть не во всяком рантайме — сборка тестов их не эмитит, и
// модуль падает при импорте.
@Schema({ timestamps: true })
export class Session {
  /** Идентификатор сессии: `jti` refresh-токена и `sId` access-токена. */
  @Prop({ type: String, required: true, unique: true, index: true })
  jti: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  /**
   * sha256 выданного refresh-токена. Сам токен не хранится: утечка дампа базы
   * иначе означала бы работающие сессии всех пользователей.
   */
  @Prop({ type: String, required: true })
  refreshTokenHash: string;

  /** Проставляется при ротации, выходе и при отзыве всей цепочки. */
  @Prop({ type: Date })
  revokedAt?: Date;

  /**
   * Срок жизни записи равен сроку жизни refresh-токена: Mongo удаляет её сам
   * (TTL-индекс), иначе коллекция растёт на каждую выданную пару навсегда.
   */
  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// expireAfterSeconds: 0 — удалять, как только `expiresAt` в прошлом.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
