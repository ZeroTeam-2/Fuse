import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { App, AppSchema } from "./app.schema";
import { AppsController } from "./apps.controller";
import { AppsService } from "./apps.service";
import { OpenApiParserService } from "./openapi-parser";
import { SsrfGuard } from "./ssrf-guard";

@Module({
  imports: [MongooseModule.forFeature([{ name: App.name, schema: AppSchema }])],
  controllers: [AppsController],
  providers: [AppsService, OpenApiParserService, SsrfGuard],
  exports: [AppsService, OpenApiParserService, SsrfGuard],
})
export class AppsModule {}
