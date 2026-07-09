import { Logger, OnModuleInit } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { RedisPubSubService } from "../execution/redis-pubsub.service";

@WebSocketGateway({
  namespace: "runs",
  cors: { origin: process.env.NODE_ENV === "production" ? false : "*" },
})
export class RunGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(RunGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly pubsub: RedisPubSubService) {}

  async onModuleInit() {
    const subscriber = this.pubsub.createSubscriber();

    subscriber.psubscribe("run:*");

    subscriber.on("pmessage", (_pattern, channel, message) => {
      const runId = channel.replace("run:", "");
      try {
        const event = JSON.parse(message);
        this.emitToRun(runId, event.type, event);
      } catch {
        this.logger.warn(`Invalid message on channel ${channel}`);
      }
    });

    subscriber.on("error", (err) => {
      this.logger.error(`Redis subscriber error: ${err.message}`);
    });

    this.logger.log("Redis pub/sub subscriber initialized");
  }

  handleConnection(client: Socket) {
    const runId = client.handshake.query.runId as string | undefined;
    if (runId) {
      client.join(`run:${runId}`);
      this.logger.log(`Client connected for run ${runId}`);
    } else {
      this.logger.log(`Client connected: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToRun(runId: string, event: string, data: unknown) {
    this.server.to(`run:${runId}`).emit(event, data);
  }
}
