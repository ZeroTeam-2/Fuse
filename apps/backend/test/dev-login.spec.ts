import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { AuthController } from "../src/auth/auth.controller";
import { YandexAuthService } from "../src/auth/yandex-auth.service";
import { UsersService } from "../src/users/users.service";
import type { UserDocument } from "../src/users/user.schema";

const DEV_EMAIL = "seed@fuse.local";
const DEV_PASSWORD = "devpassword";

const seedUser = { _id: "user-123", email: DEV_EMAIL } as unknown as UserDocument;

function makeController(env: Record<string, string>, user: UserDocument | null = seedUser) {
  const configService = {
    get: vi.fn((key: string) => env[key] ?? ""),
  } as unknown as ConfigService;

  const usersService = {
    findByEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UsersService;

  const yandexAuth = {
    issueTokens: vi.fn().mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      accessTokenMaxAge: 900_000,
      refreshTokenMaxAge: 604_800_000,
    }),
  } as unknown as YandexAuthService;

  const res = { cookie: vi.fn() } as unknown as Response;

  return {
    controller: new AuthController(yandexAuth, usersService, configService),
    res,
    yandexAuth,
    usersService,
  };
}

const configured = { DEV_LOGIN_EMAIL: DEV_EMAIL, DEV_LOGIN_PASSWORD: DEV_PASSWORD };

describe("AuthController.devLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("выдаёт сессию и ставит обе куки на верных кредах", async () => {
    const { controller, res, yandexAuth } = makeController(configured);

    const result = await controller.devLogin(
      { email: DEV_EMAIL, password: DEV_PASSWORD },
      res,
    );

    expect(result).toEqual({ success: true });
    expect(yandexAuth.issueTokens).toHaveBeenCalledWith(seedUser);
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookie).toHaveBeenCalledWith(
      "access_token",
      "access",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      "refresh_token",
      "refresh",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("отвечает 404, пока пароль не задан", async () => {
    const { controller, res, yandexAuth } = makeController({ DEV_LOGIN_EMAIL: DEV_EMAIL });

    await expect(
      controller.devLogin({ email: DEV_EMAIL, password: DEV_PASSWORD }, res),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(yandexAuth.issueTokens).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("отвечает 404, пока логин не задан", async () => {
    const { controller, res } = makeController({ DEV_LOGIN_PASSWORD: DEV_PASSWORD });

    await expect(
      controller.devLogin({ email: DEV_EMAIL, password: DEV_PASSWORD }, res),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("неверный логин и неверный пароль неразличимы", async () => {
    const wrongLogin = makeController(configured);
    const wrongPassword = makeController(configured);

    const loginError = await wrongLogin.controller
      .devLogin({ email: "someone@else.local", password: DEV_PASSWORD }, wrongLogin.res)
      .catch((err: UnauthorizedException) => err);
    const passwordError = await wrongPassword.controller
      .devLogin({ email: DEV_EMAIL, password: "wrong" }, wrongPassword.res)
      .catch((err: UnauthorizedException) => err);

    expect(loginError).toBeInstanceOf(UnauthorizedException);
    expect(passwordError).toBeInstanceOf(UnauthorizedException);
    expect(loginError.getStatus()).toBe(passwordError.getStatus());
    expect(loginError.getResponse()).toEqual(passwordError.getResponse());
    expect(wrongLogin.res.cookie).not.toHaveBeenCalled();
    expect(wrongPassword.res.cookie).not.toHaveBeenCalled();
  });

  it("сверяет пароль даже когда логин не совпал", async () => {
    // Короткого замыкания быть не должно: иначе время ответа выдаёт,
    // какое из двух полей не совпало.
    const { controller, res } = makeController(configured);
    await expect(
      controller.devLogin({ email: "someone@else.local", password: "wrong" }, res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("подсказывает про pnpm seed, когда учётки нет в базе", async () => {
    const { controller, res, yandexAuth } = makeController(configured, null);

    const error = await controller
      .devLogin({ email: DEV_EMAIL, password: DEV_PASSWORD }, res)
      .catch((err: ServiceUnavailableException) => err);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(error.getResponse())).toContain("pnpm seed");
    expect(yandexAuth.issueTokens).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("не раскрывает пароль в тексте ошибок", async () => {
    const { controller, res } = makeController(configured);

    const error = await controller
      .devLogin({ email: DEV_EMAIL, password: "wrong" }, res)
      .catch((err: UnauthorizedException) => err);

    expect(JSON.stringify(error.getResponse())).not.toContain(DEV_PASSWORD);
    expect(JSON.stringify(error.getResponse())).not.toContain("wrong");
  });
});

describe("AuthController.devLoginAvailable", () => {
  it("подтверждает доступность, когда пара кредов задана", () => {
    const { controller } = makeController(configured);
    expect(controller.devLoginAvailable()).toEqual({ available: true });
  });

  it("отвечает 404, когда креды не заданы", () => {
    const { controller } = makeController({});
    expect(() => controller.devLoginAvailable()).toThrow(NotFoundException);
  });
});
