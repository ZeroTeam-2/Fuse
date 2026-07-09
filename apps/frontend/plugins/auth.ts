export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore();

  if (!authStore.isAuthenticated) {
    await authStore.fetchUser();
  }
});
