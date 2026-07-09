import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Scenario, ScenarioSchema } from "./scenario.schema";
import { ScenariosController } from "./scenarios.controller";
import { ScenariosService } from "./scenarios.service";
import { AppsModule } from "../apps/apps.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Scenario.name, schema: ScenarioSchema },
    ]),
    AppsModule,
  ],
  controllers: [ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
