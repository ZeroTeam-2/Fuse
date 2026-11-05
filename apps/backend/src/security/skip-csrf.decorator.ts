import { SetMetadata } from "@nestjs/common";

export const SKIP_CSRF_KEY = "skipCsrf";

/**
 * Снимает проверку парного токена с маршрута.
 *
 * Ставится ровно там, где запрос приходит не из браузера пользователя и держать
 * токен в памяти клиенту негде, — сейчас это один маршрут, `POST /auth/refresh`
 * (его вызывает SSR-сервер Nuxt при рендере страницы). Проверка `Origin`
 * (`OriginGuard`) с таких маршрутов не снимается, и `SameSite=lax` на куках
 * продолжает действовать: межсайтовый POST приходит без них и получает 401.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
