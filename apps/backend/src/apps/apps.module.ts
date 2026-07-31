import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { MulterModule } from "@nestjs/platform-express";
import { mbToBytes } from "../config/file-limits.constants";
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
    // Лимит загрузки файла спецификации — из конфига (SPEC_FILE_MAX_MB), а не
    // из магического числа в декораторе контроллера. Ограничивает буферизацию
    // в память до сериализации/парсинга.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        limits: {
          fileSize: mbToBytes(
            configService.get<number>("SPEC_FILE_MAX_MB") ?? 15,
          ),
        },
      }),
      inject: [ConfigService],
    }),
    ExecutionModule,
  ],
  controllers: [AppsController],
  providers: [AppsService, OpenApiParserService, SsrfGuard],
  exports: [AppsService, OpenApiParserService, SsrfGuard],
})
export class AppsModule {}
