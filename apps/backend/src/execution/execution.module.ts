import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Run, RunSchema } from "./run.schema";
import { Scenario, ScenarioSchema } from "../scenarios/scenario.schema";
import { ExecutionController } from "./execution.controller";
import { ExecutionService } from "./execution.service";
import { WorkerService } from "./worker.service";
import { RedisPubSubService } from "./redis-pubsub.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Run.name, schema: RunSchema },
      { name: Scenario.name, schema: ScenarioSchema },
    ]),
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService, WorkerService, RedisPubSubService],
  exports: [ExecutionService, RedisPubSubService],
})
export class ExecutionModule {}
