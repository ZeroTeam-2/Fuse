import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";
import { App, AppSchema } from "../apps/app.schema";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Scenario.name, schema: ScenarioSchema },
      { name: App.name, schema: AppSchema },
    ]),
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
