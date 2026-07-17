import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Run, RunSchema } from "./run.schema";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";
import { App, AppSchema } from "../apps/app.schema";
import { ExecutionController } from "./execution.controller";
import { ExecutionService } from "./execution.service";
import { ManualInputsService } from "./manual-inputs.service";
import { WorkerService } from "./worker.service";
import { WebSocketModule } from "../websocket/websocket.module";
import { MinioModule } from "../minio/minio.module";
import { SsrfGuard } from "../apps/ssrf-guard";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Run.name, schema: RunSchema },
      { name: Scenario.name, schema: ScenarioSchema },
      // Воркер резолвит базовый URL приложения по appId шага.
      { name: App.name, schema: AppSchema },
    ]),
    WebSocketModule,
    // Воркер читает загруженный файл файлового шага из MinIO.
    MinioModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService, ManualInputsService, WorkerService, SsrfGuard],
  exports: [ExecutionService, ManualInputsService],
})
export class ExecutionModule {}
