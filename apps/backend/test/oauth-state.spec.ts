import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { DoubleCsrfUtilities } from "csrf-csrf";
import { AuthController } from "../src/auth/auth.controller";
import { YandexAuthService } from "../src/auth/yandex-auth.service";
import { SessionService } from "../src/auth/session.service";
import { UsersService } from "../src/users/users.service";

const APP_URL = "http://localhost:5173";

function makeController() {
  const configService = {
    get: vi.fn((key: string) => (key === "APP_URL" ? APP_URL : "")),
  } as unknown as ConfigService;

  const yandexAuth = {
    getAuthUrl: vi.fn((state?: string) => `https://oauth.yandex.ru/authorize?state=${state ?? ""}`),
    handleCallback: vi.fn().mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      accessTokenMaxAge: 900_000,
      refreshTokenMaxAge: 604_800_000,
    }),
  } as unknown as YandexAuthService;

  const usersService = {} as unknown as UsersService;
  const sessions = {} as unknown as SessionService;
  const csrf = {} as unknown as DoubleCsrfUtilities;

  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  } as unknown as Response;

  return {
    controller: new AuthController(yandexAuth, usersService, sessions, configService, csrf),
    res,
    yandexAuth,
  };
}

function requestWithCookies(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

describe("OAuth state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login ставит куку со state и передаёт его в OAuth-запрос", () => {
    const { controller, res, yandexAuth } = makeController();

    controller.login(res);

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, value, options] = (res.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(name).toBe("oauth_state");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(options).toEqual(
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    // Кука живёт минуты, а не сутки: окно, в котором значение можно подсунуть
    // заранее, должно закрываться само.
    expect(options.maxAge).toBeLessThanOrEqual(10 * 60 * 1000);

    // В OAuth уходит то же значение, что положено в куку.
    expect(yandexAuth.getAuthUrl).toHaveBeenCalledWith(value);
    expect(res.redirect).toHaveBeenCalledWith(302, expect.stringContaining(value as string));
  });

  it("callback обменивает код, когда state совпал, и убирает куку", async () => {
    const { controller, res, yandexAuth } = makeController();

    await controller.callback(
      "auth-code",
      undefined,
      "state-value",
      requestWithCookies({ oauth_state: "state-value" }),
      res,
    );

    expect(yandexAuth.handleCallback).toHaveBeenCalledWith("auth-code");
    // Куки сессии выставлены, одноразовая кука state снята.
    expect(res.cookie).toHaveBeenCalledWith("access_token", "access", expect.anything());
    expect(res.cookie).toHaveBeenCalledWith("refresh_token", "refresh", expect.anything());
    expect(res.clearCookie).toHaveBeenCalledWith("oauth_state", expect.anything());
    expect(res.redirect).toHaveBeenCalledWith(APP_URL);
  });

  it("не обменивает код, когда state не совпал", async () => {
    const { controller, res, yandexAuth } = makeController();

    await controller.callback(
      "auth-code",
      undefined,
      "подсунутое-значение",
      requestWithCookies({ oauth_state: "state-value" }),
      res,
    );

    // Код авторизации, полученный на чужую учётку, до обмена не доходит —
    // сессия не выдаётся.
    expect(yandexAuth.handleCallback).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`${APP_URL}/login?error=invalid_state`);
  });

  it("не обменивает код, когда куки state нет вовсе", async () => {
    const { controller, res, yandexAuth } = makeController();

    await controller.callback(
      "auth-code",
      undefined,
      "state-value",
      requestWithCookies({}),
      res,
    );

    expect(yandexAuth.handleCallback).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`${APP_URL}/login?error=invalid_state`);
  });

  it("не обменивает код, когда state не пришёл в запросе", async () => {
    const { controller, res, yandexAuth } = makeController();

    await controller.callback(
      "auth-code",
      undefined,
      undefined,
      requestWithCookies({ oauth_state: "state-value" }),
      res,
    );

    expect(yandexAuth.handleCallback).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`${APP_URL}/login?error=invalid_state`);
  });

  it("снимает куку state и при отказе пользователя во входе", async () => {
    const { controller, res, yandexAuth } = makeController();

    await controller.callback(
      undefined,
      "access_denied",
      undefined,
      requestWithCookies({ oauth_state: "state-value" }),
      res,
    );

    expect(res.clearCookie).toHaveBeenCalledWith("oauth_state", expect.anything());
    expect(yandexAuth.handleCallback).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`${APP_URL}/login?error=cancelled`);
  });
});
