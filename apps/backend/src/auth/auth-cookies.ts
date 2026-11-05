import type { CookieOptions, Response } from "express";
import type { TokenPair } from "./auth.types";

/**
 * Куки сессии: имена и атрибуты в одном месте.
 *
 * Атрибуты обязаны совпадать в `res.cookie` и в `res.clearCookie`: браузер
 * удаляет куку, только если `Path`, `Domain`, `Secure` и `SameSite` в
 * очищающем `Set-Cookie` те же, что были при установке. Разъехавшиеся копии
 * этого объекта как раз и дают «вышел, а сессия осталась».
 */

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const OAUTH_STATE_COOKIE = "oauth_state";

/**
 * `sameSite: "lax"` во всех окружениях, а не `none` в production.
 *
 * `none` означает «присылать куку на любой межсайтовый запрос», то есть
 * отключить единственную защиту от CSRF, встроенную в браузер; `strict` ломает
 * возврат из OAuth — кука не уйдёт на переход с oauth.yandex.ru. `lax`
 * пропускает навигацию верхнего уровня (возврат из OAuth работает) и не
 * пропускает межсайтовые POST.
 *
 * `path: "/"`, а не `/api`: socket.io обслуживается по `/socket.io/`, вне
 * глобального префикса. С `Path=/api` браузер не пришлёт `access_token` в
 * handshake, и аутентификация WebSocket окажется нереализуемой — положить
 * токен в `handshake.auth` нельзя, кука `HttpOnly` и из JS не читается.
 */
export function authCookieOptions(isProd: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  };
}

export function setAuthCookies(res: Response, tokens: TokenPair, isProd: boolean): void {
  const options = authCookieOptions(isProd);

  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...options,
    maxAge: tokens.accessTokenMaxAge,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...options,
    maxAge: tokens.refreshTokenMaxAge,
  });
}

export function clearAuthCookies(res: Response, isProd: boolean): void {
  const options = authCookieOptions(isProd);

  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

/**
 * Кука `state` живёт ровно столько, сколько занимает вход: пользователь уходит
 * на oauth.yandex.ru и возвращается. Сутки жизни здесь были бы окном, в котором
 * значение можно подсунуть заранее.
 */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function setOAuthStateCookie(res: Response, state: string, isProd: boolean): void {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...authCookieOptions(isProd),
    maxAge: OAUTH_STATE_MAX_AGE_MS,
  });
}

export function clearOAuthStateCookie(res: Response, isProd: boolean): void {
  res.clearCookie(OAUTH_STATE_COOKIE, authCookieOptions(isProd));
}
