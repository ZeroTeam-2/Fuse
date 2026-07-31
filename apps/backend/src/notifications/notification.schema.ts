import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type { NotificationType } from "@fuse/shared";

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  runId: string;

  @Prop({ required: true })
  scenarioId: string;

  // Денормализовано при создании — уведомление переживает удаление сценария.
  @Prop({ required: true })
  scenarioTitle: string;

  @Prop({ required: true, type: String })
  type: NotificationType;

  /**
   * Шаг, на котором запуск ждёт ввода. Часть ключа идемпотентности: запуск
   * с несколькими страницами останавливается несколько раз, и каждая остановка —
   * отдельное уведомление; у терминальных типов поля нет.
   */
  @Prop()
  stepIndex?: number;

  @Prop({ required: true, default: false })
  read: boolean;
}

export type NotificationDocument = HydratedDocument<Notification> & {
  createdAt: Date;
  updatedAt: Date;
};
export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Лента и счётчик колокольчика.
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });
// Идемпотентность: повторная доставка SQS-сообщения того же перехода статуса
// не создаёт дубликата (duplicate key игнорируется в сервисе).
NotificationSchema.index({ runId: 1, type: 1, stepIndex: 1 }, { unique: true });
