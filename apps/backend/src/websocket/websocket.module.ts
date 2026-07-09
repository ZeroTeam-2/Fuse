import { Module } from "@nestjs/common";
import { RunGateway } from "./run.gateway";
import { ExecutionModule } from "../execution/execution.module";

@Module({
  imports: [ExecutionModule],
  providers: [RunGateway],
  exports: [RunGateway],
})
export class WebSocketModule {}
