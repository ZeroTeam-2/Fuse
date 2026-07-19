import { Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { JwtService } from "@nestjs/jwt";
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { NotificationNewPayload } from "@fuse/shared";
import { Notification, NotificationDocument } from "./notification.schema";
import type { JwtPayload } from "../auth/auth.types";

/**
 * Канал колокольчика. В отличие от `RunGateway`, где комната — публичный
 * `runId` из query, здесь комната персональная, поэтому userId берётся только
 * из проверенного JWT (кука `access_token` в handshake), а не из параметров:
 * иначе любой клиент подписался бы на чужие уведомления.
 */
@WebSocketGateway({
  namespace: "notifications",
  cors: {
    origin: process.env.APP_URL ?? "http://localhost:5173",
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly jwtService: JwtService,
  ) {}

  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket): Promise<void> {
    const userId = this.authenticate(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }

    client.join(`user:${userId}`);

    // Снапшот при подключении: события до входа в комнату socket.io не
    // реплеит, актуальный счётчик клиент получает сразу.
    const unreadCount = await this.notificationModel
      .countDocuments({ userId, read: false })
      .exec();
    client.emit("notifications:snapshot", { unreadCount });
  }

  private authenticate(client: Socket): string | null {
    const cookieHeader = client.handshake.headers.cookie ?? "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("access_token="))
      ?.slice("access_token=".length);

    if (!token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(
        decodeURIComponent(token),
      );
      return payload.userId ?? null;
    } catch {
      this.logger.warn("Notifications handshake with invalid JWT rejected");
      return null;
    }
  }

  emitNew(userId: string, payload: NotificationNewPayload): void {
    this.server?.to(`user:${userId}`).emit("notification:new", payload);
  }
}
