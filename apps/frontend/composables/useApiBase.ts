/**
 * В проде NUXT_PUBLIC_API_BASE_URL равен "/" — фронт и бэк стоят за одним
 * caddy, поэтому запросы идут относительными путями. Наивная склейка
 * `${base}/api/...` даёт "//api/..." — это протокол-относительный URL, и
 * браузер уходит на несуществующий хост "api". Срезаем хвостовые слэши:
 * "/" превращается в "", и путь остаётся относительным.
 */
export function useApiBase(): string {
  const config = useRuntimeConfig();
  const base = config.public.apiBaseUrl || "http://localhost:3001";
  return base.replace(/\/+$/, "");
}
