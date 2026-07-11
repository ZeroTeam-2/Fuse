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
      await fetch(`${useApiBase()}/api/auth/logout`, { credentials: "include" });
      this.clearUser();
    },
  },
});
