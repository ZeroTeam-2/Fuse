import { io, type Socket } from "socket.io-client";
import type {
  NotificationNewPayload,
  NotificationsSnapshotPayload,
} from "@fuse/shared";

/**
 * Живой канал колокольчика: socket.io namespace `notifications`. Комнату
 * `user:{userId}` сервер выбирает сам по JWT из куки handshake — клиент ничего
 * о себе не сообщает. При подключении приходит снапшот счётчика (события до
 * входа в комнату socket.io не реплеит), дальше — `notification:new`.
 */
export function useNotificationsSocket() {
  const apiBase = useApiBase();
  const store = useNotificationsStore();

  const socket = shallowRef<Socket | null>(null);

  function connect() {
    if (socket.value) return;

    const client = io(`${apiBase}/notifications`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socket.value = client;

    client.on("notifications:snapshot", (payload: NotificationsSnapshotPayload) => {
      store.applySnapshot(payload.unreadCount);
    });

    client.on("notification:new", (payload: NotificationNewPayload) => {
      store.applyNew(payload.notification, payload.unreadCount);
    });
  }

  function disconnect() {
    socket.value?.disconnect();
    socket.value = null;
  }

  return { connect, disconnect };
}
