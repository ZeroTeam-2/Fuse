import { Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { ServerWsEvent } from "@fuse/shared";
import { Run, RunDocument } from "../execution/run.schema";

// origin берём тот же, что и у HTTP-CORS в main.ts. Раньше в проде стоял
// origin: false, что резало handshake, а в деве "*" несовместим с
// credentials: браузер отвергает wildcard, когда клиент шлёт куки.
@WebSocketGateway({
  namespace: "runs",
  cors: {
    origin: process.env.APP_URL ?? "http://localhost:5173",
    credentials: true,
  },
})
export class RunGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RunGateway.name);

  constructor(
    @InjectModel(Run.name) private readonly runModel: Model<RunDocument>,
  ) {}

  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket): Promise<void> {
    const runId = client.handshake.query.runId as string | undefined;
    if (!runId) {
      this.logger.log(`Client connected: ${client.id}`);
      return;
    }

    client.join(`run:${runId}`);
    this.logger.log(`Client connected for run ${runId}`);

    // Клиент подключается УЖЕ ПОСЛЕ POST /api/runs, то есть worker мог начать
    // (а для быстрого или мгновенно падающего запуска — и закончить) исполнение
    // раньше, чем сокет вошёл в комнату. socket.io пропущенные события не
    // реплеит, поэтому без снапшота такой клиент навсегда остаётся без
    // обратной связи. Порядок важен: join → чтение → emit, тогда события,
    // случившиеся после join, не теряются, а случившиеся до — приедут здесь.
    await this.sendSnapshot(client, runId);
  }

  private async sendSnapshot(client: Socket, runId: string): Promise<void> {
    let run: RunDocument | null;
    try {
      run = await this.runModel.findById(runId).exec();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to load snapshot for run ${runId}: ${reason}`);
      return;
    }

    if (!run) {
      return;
    }

    const snapshot: ServerWsEvent = {
      type: "run:status",
      runId,
      payload: {
        status: run.status,
        currentStep: run.currentStep ?? 0,
        stepResults: run.stepResults ?? [],
        error: run.error,
      },
      timestamp: new Date().toISOString(),
    };

    client.emit(snapshot.type, snapshot);
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
