import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Notification, NotificationSchema } from "./notification.schema";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { Run, RunSchema } from "../execution/run.schema";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";

/**
 * Сервис и REST-ручки колокольчика. Гейтвей живёт в
 * `NotificationsGatewayModule`: сервис публикует через `EVENT_BUS`, и держать
 * гейтвей рядом замыкало бы модули в цикл. Благодаря этому модуль
 * переиспользуется воркер-процессом как есть — без socket.io.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Run.name, schema: RunSchema },
      { name: Scenario.name, schema: ScenarioSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
