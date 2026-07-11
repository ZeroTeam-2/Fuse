import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { App, AppSchema } from "./app.schema";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";
import { AppsController } from "./apps.controller";
import { AppsService } from "./apps.service";
import { OpenApiParserService } from "./openapi-parser";
import { SsrfGuard } from "./ssrf-guard";
import { ExecutionModule } from "../execution/execution.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: App.name, schema: AppSchema },
      // Нужна, чтобы при удалении приложения найти сценарии, чьи шаги на
      // него ссылаются, и остановить их активные запуски.
      { name: Scenario.name, schema: ScenarioSchema },
    ]),
    ExecutionModule,
  ],
  controllers: [AppsController],
  providers: [AppsService, OpenApiParserService, SsrfGuard],
  exports: [AppsService, OpenApiParserService, SsrfGuard],
})
export class AppsModule {}
