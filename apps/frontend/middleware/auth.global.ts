export default defineNuxtRouteMiddleware((to) => {
  const publicRoutes = ["/", "/login", "/ui-kit"];
  const isPublic = publicRoutes.includes(to.path);

  if (isPublic) return;

  const authStore = useAuthStore();

  if (!authStore.isAuthenticated) {
    return navigateTo("/login");
  }
});
