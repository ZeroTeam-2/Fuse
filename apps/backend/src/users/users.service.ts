import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { SESSION_COLLECTION } from "../auth/session.schema";
import { User, UserDocument } from "./user.schema";
import { UpdateProfileDto } from "./dto/update-profile.dto";

/** Пользователь вместе с состоянием сессии, полученные одним запросом. */
export interface UserWithSession {
  email: string;
  tokenVersion: number;
  /** Сессия найдена и не отозвана. */
  sessionActive: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async findByYandexId(yandexId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ yandexId }).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async create(data: {
    yandexId?: string;
    email: string;
    firstName: string;
    lastName?: string;
    avatarUrl?: string;
  }): Promise<UserDocument> {
    return new this.userModel(data).save();
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async updateAvatar(id: string, avatarUrl: string, avatarObjectId?: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: { avatarUrl, avatarObjectId } }, { new: true })
      .exec();
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  /**
   * Пользователь и его сессия одним обращением к базе.
   *
   * Проверка токена выполняется на каждом запросе к API, и раздельные запросы
   * за пользователем и за сессией удвоили бы обращения к Mongo на всём трафике.
   * `$lookup` по коллекции сессий идёт в том же запросе, что и выборка
   * пользователя; `$limit: 1` внутри — `jti` уникален, больше одной записи там
   * не бывает.
   */
  async findWithSession(id: string, sessionId: string): Promise<UserWithSession | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const rows = await this.userModel
      .aggregate<{
        email: string;
        tokenVersion?: number;
        session?: { revokedAt?: Date } | null;
      }>([
        { $match: { _id: new Types.ObjectId(id) } },
        {
          $lookup: {
            from: SESSION_COLLECTION,
            pipeline: [
              { $match: { jti: sessionId, userId: id } },
              { $limit: 1 },
              { $project: { revokedAt: 1 } },
            ],
            as: "sessions",
          },
        },
        {
          $project: {
            email: 1,
            tokenVersion: 1,
            session: { $arrayElemAt: ["$sessions", 0] },
          },
        },
      ])
      .exec();

    const row = rows[0];
    if (!row) return null;

    return {
      email: row.email,
      // Учётки, заведённые до появления поля, читаются как нулевая версия.
      tokenVersion: row.tokenVersion ?? 0,
      sessionActive: Boolean(row.session) && !row.session?.revokedAt,
    };
  }

  /**
   * «Выйти везде»: новая версия обесценивает все выданные access-токены.
   * Возвращается уже увеличенное значение — им подписывается новая пара.
   */
  async bumpTokenVersion(id: string): Promise<number> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } }, { new: true })
      .exec();
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user.tokenVersion;
  }

  async removeAvatar(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $unset: { avatarUrl: "", avatarObjectId: "" } }, { new: true })
      .exec();
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }
}
