import { createHash } from "node:crypto";
import { doubleCsrf, type DoubleCsrfUtilities } from "csrf-csrf";
import type { Request } from "express";
import { ACCESS_TOKEN_COOKIE } from "../auth/auth-cookies";

/**
 * CSRF — парный токен (signed double submit).
 *
 * Кука `HttpOnly` со случайным значением ставится сервером, парный токен
 * выдаётся **телом** ответа `GET /api/auth/csrf-token`, клиент держит его в
 * памяти и присылает заголовком `x-csrf-token`. Схема «клиент читает токен из
 * куки» несовместима с `HttpOnly`: чтобы её реализовать, куку пришлось бы
 * открыть для JS, и тогда XSS снимает защиту целиком.
 *
 * Межсайтовый запрос не может ни прочитать куку, ни подставить заголовок, а
 * своя пара (кука + токен), полученная атакующим на своём браузере, не подойдёт
 * к куке жертвы — проверяется именно их соответствие.
 */

export const CSRF_COOKIE = "csrf_token";
export const CSRF_HEADER = "x-csrf-token";

/** Токен в этом поле ответа ищет фронтенд. */
export interface CsrfTokenResponse {
  csrfToken: string;
}

/**
 * Секрет HMAC выводится из `JWT_SECRET` с разделением ролей, а не берётся им
 * самим и не заводится отдельной переменной окружения.
 *
 * Отдельная переменная — это ещё один обязательный секрет в каждом профиле и
 * ещё одна возможность забыть его при развёртывании; прямое переиспользование
 * `JWT_SECRET` в другой роли — ровно та ошибка, из-за которой до ротации одно
 * значение подписывало и токены доступа, и сессию Nuxt. Хэш от значения с
 * меткой роли даёт независимый ключ: по нему нельзя восстановить `JWT_SECRET`,
 * и компрометация CSRF-ключа не даёт права подписывать токены.
 */
export function deriveCsrfSecret(jwtSecret: string): string {
  return createHash("sha256").update(`${jwtSecret}|csrf`).digest("hex");
}

/**
 * Привязка токена к пользователю. Берётся из полезной нагрузки access-токена
 * **без проверки подписи**: значение идёт только в HMAC вместе с секретом
 * сервера, решения об аутентификации на нём не принимаются, и подделка его
 * атакующему ничего не даёт — к куке жертвы всё равно не подойдёт.
 *
 * Проверять подпись здесь было бы нельзя: токен выдаётся и неаутентифицированному
 * клиенту (форма локального входа), а парный токен обязан пережить обновление
 * access-токена каждые 15 минут — поэтому привязка к `userId`, а не к самому
 * токену.
 */
export function csrfSessionIdentifier(req: Request): string {
  const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_TOKEN_COOKIE];
  if (!token) return "";

  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { userId?: unknown };
    return typeof decoded.userId === "string" ? decoded.userId : "";
  } catch {
    // Нечитаемый токен — анонимный клиент: куку и токен он получит обычные.
    return "";
  }
}

export function createCsrfUtilities(options: {
  jwtSecret: string;
  isProd: boolean;
}): DoubleCsrfUtilities {
  const secret = deriveCsrfSecret(options.jwtSecret);

  return doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: csrfSessionIdentifier,
    cookieName: CSRF_COOKIE,
    cookieOptions: {
      httpOnly: true,
      secure: options.isProd,
      sameSite: "lax",
      path: "/",
    },
    getCsrfTokenFromRequest: (req) => req.headers[CSRF_HEADER],
  });
}

/** Токен проверяется у методов, изменяющих состояние; GET/HEAD/OPTIONS — нет. */
export const CSRF_SAFE_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);
