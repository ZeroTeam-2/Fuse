import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { validateEnv } from "./config/env.schema";
import { Run, RunSchema } from "./execution/run.schema";
import { Scenario, ScenarioSchema } from "./scenarios/scenario.schema";
import { App, AppSchema } from "./apps/app.schema";
import { WorkerService } from "./execution/worker.service";
import { ManualInputsService } from "./execution/manual-inputs.service";
import { SsrfGuard } from "./apps/ssrf-guard";
import { MinioModule } from "./minio/minio.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { EventsModule } from "./events/events.module";

/**
 * Корневой модуль воркер-процесса (`worker-main.ts`).
 *
 * Состав — минимальный импортный замок `WorkerService`, а не копия
 * `AppModule`: контроллеров, гвардов, Swagger и socket.io-гейтвеев здесь нет,
 * как нет и модулей `auth`, `uploads`, `marketplace`, `users`, `logging` —
 * исполнение шагов к ним не обращается.
 *
 * Режим шины задаётся здесь и только здесь: `EventsModule.forWorker()` ставит
 * за `EVENT_BUS` мост через Mongo, потому что сокетов в этом процессе нет.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Тот же порядок файлов, что у API: .env.local перекрывает .env, иначе
      // воркер смотрел бы в другую инфраструктуру, чем API рядом с ним.
      envFilePath: ["../../.env.local", "../../.env", ".env"],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>("MONGODB_URL"),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Run.name, schema: RunSchema },
      { name: Scenario.name, schema: ScenarioSchema },
      // Воркер резолвит базовый URL приложения по appId шага.
      { name: App.name, schema: AppSchema },
    ]),
    // Воркер читает загруженный файл файлового шага из S3.
    MinioModule,
    // Уведомления о переходах запуска (завершение, ожидание ввода).
    NotificationsModule,
    EventsModule.forWorker(),
  ],
  providers: [WorkerService, ManualInputsService, SsrfGuard],
})
export class WorkerAppModule {}
