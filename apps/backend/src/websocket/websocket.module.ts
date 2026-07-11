import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Run, RunSchema } from "../execution/run.schema";
import { RunGateway } from "./run.gateway";

@Module({
  // Гейтвей отдаёт снапшот состояния Run при подключении клиента к комнате.
  imports: [MongooseModule.forFeature([{ name: Run.name, schema: RunSchema }])],
  providers: [RunGateway],
  exports: [RunGateway],
})
export class WebSocketModule {}
