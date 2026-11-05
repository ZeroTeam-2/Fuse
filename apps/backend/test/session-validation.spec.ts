import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { DoubleCsrfUtilities } from "csrf-csrf";
import { JwtStrategy } from "../src/auth/strategies/jwt.strategy";
import { AuthController } from "../src/auth/auth.controller";
import { YandexAuthService } from "../src/auth/yandex-auth.service";
import { SessionService } from "../src/auth/session.service";
import { hashRefreshToken } from "../src/auth/session.service";
import type { SessionDocument } from "../src/auth/session.schema";
import { UsersService } from "../src/users/users.service";
import type { AuthenticatedRequest } from "../src/auth/auth.types";

const configService = {
  get: vi.fn(() => ""),
  getOrThrow: vi.fn(() => "test-secret-at-least-32-characters!!"),
} as unknown as ConfigService;

describe("JwtStrategy.validate", () => {
  let usersService: Partial<UsersService>;
  let strategy: JwtStrategy;

  beforeEach(() => {
    vi.clearAllMocks();

    usersService = {
      findWithSession: vi.fn().mockResolvedValue({
        email: "test@yandex.ru",
        tokenVersion: 0,
        sessionActive: true,
      }),
    };

    strategy = new JwtStrategy(configService, usersService as UsersService);
  });

  it("пропускает токен с действующей сессией и совпавшей версией", async () => {
    const user = await strategy.validate({
      userId: "user-123",
      email: "stale@yandex.ru",
      sId: "sess-1",
      ver: 0,
    });

    expect(user).toEqual({
      userId: "user-123",
      email: "test@yandex.ru",
      sId: "sess-1",
    });
    // Пользователь и сессия берутся одним запросом: метод выполняется на
    // каждом запросе к API, второе обращение к базе удвоило бы их число.
    expect(usersService.findWithSession).toHaveBeenCalledTimes(1);
    expect(usersService.findWithSession).toHaveBeenCalledWith("user-123", "sess-1");
  });

  it("отбивает токен без идентификатора сессии", async () => {
    // Токены, выпущенные до перехода на сессии: отозвать их нечем.
    await expect(
      strategy.validate({ userId: "user-123", email: "test@yandex.ru" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findWithSession).not.toHaveBeenCalled();
  });

  it("отбивает токен отозванной сессии", async () => {
    usersService.findWithSession = vi.fn().mockResolvedValue({
      email: "test@yandex.ru",
      tokenVersion: 0,
      sessionActive: false,
    });

    await expect(
      strategy.validate({ userId: "user-123", email: "test@yandex.ru", sId: "sess-1", ver: 0 }),
    ).rejects.toThrow("Session revoked");
  });

  it("отбивает токен старой версии после «выйти везде»", async () => {
    usersService.findWithSession = vi.fn().mockResolvedValue({
      email: "test@yandex.ru",
      tokenVersion: 4,
      sessionActive: true,
    });

    await expect(
      strategy.validate({ userId: "user-123", email: "test@yandex.ru", sId: "sess-1", ver: 3 }),
    ).rejects.toThrow("Token is no longer valid");
  });

  it("отбивает токен исчезнувшего пользователя", async () => {
    usersService.findWithSession = vi.fn().mockResolvedValue(null);

    await expect(
      strategy.validate({ userId: "user-404", email: "test@yandex.ru", sId: "sess-1", ver: 0 }),
    ).rejects.toThrow("User not found");
  });
});

describe("SessionService.matchesRefreshToken", () => {
  const service = new SessionService({} as never);

  it("принимает тот же токен и отбивает любой другой", () => {
    const session = {
      refreshTokenHash: hashRefreshToken("real-refresh-token"),
    } as unknown as SessionDocument;

    expect(service.matchesRefreshToken(session, "real-refresh-token")).toBe(true);
    expect(service.matchesRefreshToken(session, "another-token")).toBe(false);
  });

  it("отбивает запись с пустым или нечитаемым хэшем", () => {
    // Иначе сравнение пустых буферов сошло бы за совпадение.
    expect(
      service.matchesRefreshToken({ refreshTokenHash: "" } as unknown as SessionDocument, "x"),
    ).toBe(false);
  });
});

describe("AuthController: выход", () => {
  function makeController() {
    const sessions = {
      revoke: vi.fn().mockResolvedValue(undefined),
      revokeAllForUser: vi.fn().mockResolvedValue(3),
    } as unknown as SessionService;

    const usersService = {
      bumpTokenVersion: vi.fn().mockResolvedValue(1),
    } as unknown as UsersService;

    const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;

    const controller = new AuthController(
      {} as unknown as YandexAuthService,
      usersService,
      sessions,
      configService,
      {} as unknown as DoubleCsrfUtilities,
    );

    const req = {
      user: { userId: "user-123", email: "test@yandex.ru", sId: "sess-1" },
    } as unknown as AuthenticatedRequest;

    return { controller, sessions, usersService, res, req };
  }

  it("отзывает сессию запроса и снимает обе куки", async () => {
    const { controller, sessions, res, req } = makeController();

    await expect(controller.logout(req, res)).resolves.toEqual({ success: true });

    expect(sessions.revoke).toHaveBeenCalledWith("sess-1");
    expect(res.clearCookie).toHaveBeenCalledWith("access_token", expect.anything());
    expect(res.clearCookie).toHaveBeenCalledWith("refresh_token", expect.anything());
  });

  it("«выйти везде» отзывает все сессии и поднимает версию токенов", async () => {
    const { controller, sessions, usersService, res, req } = makeController();

    const result = await controller.logoutAll(req, res);

    expect(result).toEqual({ success: true, revokedSessions: 3 });
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith("user-123");
    // Версия обесценивает уже выданные access-токены, не дожидаясь их 15 минут.
    expect(usersService.bumpTokenVersion).toHaveBeenCalledWith("user-123");
  });
});
