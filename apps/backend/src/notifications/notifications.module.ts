import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Notification, NotificationSchema } from "./notification.schema";
import { NotificationsService } from "./notifications.service";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsController } from "./notifications.controller";
import { Run, RunSchema } from "../execution/run.schema";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Run.name, schema: RunSchema },
      { name: Scenario.name, schema: ScenarioSchema },
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
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
