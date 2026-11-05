import { createHash, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Session, SessionDocument } from "./session.schema";

/** Хэш refresh-токена: в базе лежит он, а не сам токен. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Сравнение хэшей за постоянное время: длина фиксирована, буферы равны. */
function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

@Injectable()
export class SessionService {
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
  ) {}

  async create(data: {
    jti: string;
    userId: string;
    refreshToken: string;
    expiresAt: Date;
  }): Promise<SessionDocument> {
    return new this.sessionModel({
      jti: data.jti,
      userId: data.userId,
      refreshTokenHash: hashRefreshToken(data.refreshToken),
      expiresAt: data.expiresAt,
    }).save();
  }

  async findByJti(jti: string): Promise<SessionDocument | null> {
    return this.sessionModel.findOne({ jti }).exec();
  }

  /** Действующая сессия: запись есть и не отозвана. */
  async validate(jti: string): Promise<SessionDocument | null> {
    const session = await this.findByJti(jti);
    if (!session || session.revokedAt) return null;
    return session;
  }

  async revoke(jti: string): Promise<void> {
    await this.sessionModel
      .updateOne({ jti, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } })
      .exec();
  }

  /**
   * Отзыв всех сессий пользователя. Вызывается и при «выйти везде», и при
   * предъявлении уже отозванного refresh-токена: такой токен означает, что
   * копия сессии есть у кого-то ещё, и цепочку обрывают целиком.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.sessionModel
      .updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount;
  }

  /** Предъявленный токен — тот самый, что был выдан для этой сессии. */
  matchesRefreshToken(session: SessionDocument, refreshToken: string): boolean {
    return hashesEqual(session.refreshTokenHash, hashRefreshToken(refreshToken));
  }
}
