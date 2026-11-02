import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Notification, NotificationSchema } from "./notification.schema";
import { NotificationsGateway } from "./notifications.gateway";

/**
 * Гейтвей колокольчика отдельно от `NotificationsModule`.
 *
 * Развязка от цикла: `NotificationsService` публикует через `EVENT_BUS`, то
 * есть зависит от `EventsModule`, а API-реализация шины (`LocalEventBus`)
 * зависит от самого гейтвея. Пока гейтвей лежал в одном модуле с сервисом,
 * получалось `NotificationsModule → EventsModule → NotificationsModule`.
 *
 * Побочный выигрыш: воркер-процесс импортирует `NotificationsModule` и не
 * тянет за собой socket.io-гейтвей, которому в нём нечего обслуживать.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    // Свой JwtModule: gateway проверяет токен handshake сам — глобального
    // Passport-гварда на WebSocket нет.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET") ?? "fallback",
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [NotificationsGateway],
  exports: [NotificationsGateway],
})
export class NotificationsGatewayModule {}
