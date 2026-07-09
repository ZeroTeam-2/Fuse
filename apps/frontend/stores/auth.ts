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
        const { $api } = useNuxtApp() as unknown as {
          $api: {
            GET: (
              url: string,
              opts: Record<string, unknown>,
            ) => Promise<{
              data: { value: User | null };
              error: { value: unknown };
            }>;
          };
        };
        const { data, error } = await $api.GET("/api/users/me", {});
        if (error.value || !data.value) {
          this.user = null;
          return;
        }
        this.user = data.value;
      } catch {
        this.user = null;
      }
    },

    clearUser() {
      this.user = null;
    },
  },
});
