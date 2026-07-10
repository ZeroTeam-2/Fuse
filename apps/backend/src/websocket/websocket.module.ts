import { Module } from "@nestjs/common";
import { RunGateway } from "./run.gateway";

@Module({
  providers: [RunGateway],
  exports: [RunGateway],
})
export class WebSocketModule {}
