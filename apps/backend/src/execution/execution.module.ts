import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Run, RunSchema } from "./run.schema";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";
import { App, AppSchema } from "../apps/app.schema";
import { ExecutionController } from "./execution.controller";
import { ExecutionService } from "./execution.service";
import { WorkerService } from "./worker.service";
import { WebSocketModule } from "../websocket/websocket.module";
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
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService, WorkerService, SsrfGuard],
  exports: [ExecutionService],
})
export class ExecutionModule {}
