import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { validateEnv } from "./config/env.schema";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { MinioModule } from "./minio/minio.module";
import { WebSocketModule } from "./websocket/websocket.module";
import { ExecutionModule } from "./execution/execution.module";
import { AppsModule } from "./apps/apps.module";
import { ScenariosModule } from "./scenarios/scenarios.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { UploadsModule } from "./uploads/uploads.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { LoggingModule } from "./logging/logging.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env.local перекрывает .env (первый файл в списке выигрывает при коллизии
      // ключей): локальный профиль инфраструктуры включается созданием файла из
      // .env.local.example, выключается — его удалением. Боевой .env не трогаем.
      envFilePath: ["../../.env.local", "../../.env", ".env"],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>("MONGODB_URL"),
      }),
      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET") ?? "fallback",
        signOptions: {
          expiresIn: (configService.get<string>("JWT_ACCESS_EXPIRES") || "15m") as never,
        },
      }),
      inject: [ConfigService],
    }),
    MinioModule,
    UsersModule,
    AuthModule,
    WebSocketModule,
    ExecutionModule,
    AppsModule,
    ScenariosModule,
    MarketplaceModule,
    UploadsModule,
    NotificationsModule,
    LoggingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
