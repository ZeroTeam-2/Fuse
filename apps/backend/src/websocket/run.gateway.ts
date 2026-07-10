import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { ServerWsEvent } from "@fuse/shared";

@WebSocketGateway({
  namespace: "runs",
  cors: { origin: process.env.NODE_ENV === "production" ? false : "*" },
})
export class RunGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RunGateway.name);

  @WebSocketServer()
  server: Server;

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

  /**
   * Публикует событие исполнения в socket.io-комнату run'а.
   * Worker исполняется в том же процессе, что и gateway, поэтому
   * события отправляются напрямую в память — без внешнего брокера.
   */
  publish(runId: string, event: ServerWsEvent): void {
    this.emitToRun(runId, event.type, event);
  }

  emitToRun(runId: string, event: string, data: unknown) {
    this.server?.to(`run:${runId}`).emit(event, data);
  }
}
