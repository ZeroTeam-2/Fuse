export default defineNuxtRouteMiddleware((to) => {
  const publicRoutes = ["/", "/login", "/ui-kit"];
  const isPublic = publicRoutes.includes(to.path) || to.path.startsWith("/cards/");

  if (isPublic) return;

  const authStore = useAuthStore();

  if (!authStore.isAuthenticated) {
    // Страницы входа нет: возвращаем гостя в маркетплейс, а модалку поднимает
    // LoginModal по query (редирект может случиться ещё на сервере).
    return navigateTo({ path: "/", query: { login: "1" } });
  }
});
