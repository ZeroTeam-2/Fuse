import { defineStore } from "pinia";
import type { User } from "@fuse/shared";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null as User | null,
    loading: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
  },

  actions: {
    async fetchUser() {
      try {
        const api = useApi();
        const { data, error } = await api.GET("/api/users/me", {});
        if (error || !data) {
          this.user = null;
          return;
        }
        this.user = data;
      } catch {
        this.user = null;
      }
    },

    clearUser() {
      this.user = null;
    },

    async logout() {
      // POST, а не GET: по GET сессию завершала бы любая картинка с чужого
      // сайта. Запрос идёт через $apiFetch — он подставляет парный CSRF-токен.
      const apiFetch = useApiFetch();
      await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      useCsrfReset()();
      this.clearUser();
    },

    /** Выход на всех устройствах: отзывает все сессии пользователя. */
    async logoutEverywhere() {
      const apiFetch = useApiFetch();
      await apiFetch("/api/auth/logout-all", { method: "POST" }).catch(() => undefined);
      useCsrfReset()();
      this.clearUser();
    },
  },
});
