import { defineStore } from "pinia";
import type { RunNotification } from "@fuse/shared";

/**
 * Лента колокольчика. Данные приходят двумя путями: REST при загрузке
 * (страница могла открыться, когда всё уже случилось) и события
 * `notification:new` из socket.io-канала `notifications` в реальном времени.
 */
export const useNotificationsStore = defineStore("notifications", {
  state: () => ({
    items: [] as RunNotification[],
    unreadCount: 0,
    loaded: false,
  }),

  actions: {
    async fetchInitial() {
      try {
        const api = useApi();
        const [list, unread] = await Promise.all([
          api.GET("/api/notifications", {
            params: { query: { page: 1, limit: 10 } },
          }),
          api.GET("/api/notifications/unread-count", {}),
        ]);
        const listData = list.data as
          | { data?: RunNotification[] }
          | undefined;
        if (listData?.data) this.items = listData.data;
        const unreadData = unread.data as
          | { unreadCount?: number }
          | undefined;
        if (typeof unreadData?.unreadCount === "number") {
          this.unreadCount = unreadData.unreadCount;
        }
        this.loaded = true;
      } catch {
        // Колокольчик — не критичный путь: без данных просто пустая панель.
      }
    },

    /** Снапшот gateway при подключении: счётчик без перезагрузки ленты. */
    applySnapshot(unreadCount: number) {
      this.unreadCount = unreadCount;
      // Счётчик разошёлся с загруженной лентой — значит, между REST и
      // подключением что-то произошло; перечитываем.
      if (this.loaded) void this.fetchInitial();
    },

    applyNew(notification: RunNotification, unreadCount: number) {
      this.items = [
        notification,
        ...this.items.filter((item) => item.id !== notification.id),
      ].slice(0, 10);
      this.unreadCount = unreadCount;
    },

    /** Эталонное поведение: открытие панели гасит все непрочитанные. */
    async markAllRead() {
      if (this.unreadCount === 0) return;
      this.unreadCount = 0;
      this.items = this.items.map((item) =>
        item.read ? item : { ...item, read: true },
      );
      try {
        await useApi().POST("/api/notifications/read-all", {});
      } catch {
        // Не удалось — счётчик восстановится следующим снапшотом.
      }
    },

    clear() {
      this.items = [];
      this.unreadCount = 0;
      this.loaded = false;
    },
  },
});
