import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Run, RunSchema } from "./run.schema";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";
import { App, AppSchema } from "../apps/app.schema";
import { ExecutionController } from "./execution.controller";
import { ExecutionService } from "./execution.service";
import { ManualInputsService } from "./manual-inputs.service";
import { MinioModule } from "../minio/minio.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SsrfGuard } from "../apps/ssrf-guard";

/**
 * API-срез исполнения: REST-ручки запусков. `WorkerService` здесь больше нет —
 * консьюмер очереди живёт в `WorkerAppModule` отдельного процесса, поэтому
 * `node dist/main` очередь не потребляет. Переключателя через env нет
 * намеренно: режим определяется entrypoint'ом.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Run.name, schema: RunSchema },
      { name: Scenario.name, schema: ScenarioSchema },
      // ManualInputsService резолвит схемы шагов по приложению.
      { name: App.name, schema: AppSchema },
    ]),
    // Отмена запуска публикует run:status — через EVENT_BUS, а не гейтвей:
    // в API-процессе за токеном стоит LocalEventBus, в воркере — мост.
    MinioModule,
    // Уведомления о переходах запуска (завершение, ожидание ввода) и каскад
    // их удаления вместе с запуском.
    NotificationsModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService, ManualInputsService, SsrfGuard],
  exports: [ExecutionService, ManualInputsService],
})
export class ExecutionModule {}
