import { describe, it, expect, vi, beforeEach } from "vitest";
import { YandexAuthService } from "../src/auth/yandex-auth.service";
import { SessionService } from "../src/auth/session.service";
import type { SessionDocument } from "../src/auth/session.schema";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../src/users/users.service";

// randomUUID фиксируется: идентификатор сессии попадает и в токен, и в запись
// базы, и проверять его проще по известному значению. Остальной node:crypto
// настоящий — на нём считается хэш refresh-токена.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => "test-uuid" };
});

const activeSession = {
  jti: "sess-1",
  userId: "user-123",
  refreshTokenHash: "hash",
  revokedAt: undefined,
} as unknown as SessionDocument;

describe("YandexAuthService", () => {
  let service: YandexAuthService;
  let mockConfigService: Partial<ConfigService>;
  let mockUsersService: Partial<UsersService>;
  let mockJwtService: Partial<JwtService>;
  let mockSessions: Partial<SessionService>;

  beforeEach(() => {
    vi.clearAllMocks();

    const configValues: Record<string, string> = {
      YANDEX_CLIENT_ID: "test-client-id",
      YANDEX_CLIENT_SECRET: "test-secret",
      YANDEX_REDIRECT_URI: "http://localhost:3001/api/auth/callback",
      JWT_SECRET: "test-secret-at-least-32-characters!!",
      JWT_ACCESS_EXPIRES: "15m",
      JWT_REFRESH_EXPIRES: "7d",
    };

    mockConfigService = {
      get: vi.fn((key: string) => configValues[key] ?? ""),
      // Секрет подписи читается через getOrThrow: подставного значения для
      // незаданного JWT_SECRET в коде больше нет.
      getOrThrow: vi.fn((key: string) => {
        const value = configValues[key];
        if (value === undefined) throw new Error(`${key} is not defined`);
        return value;
      }),
    } as Partial<ConfigService>;

    mockUsersService = {
      findByYandexId: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue({
        _id: "user-123",
        email: "test@yandex.ru",
        firstName: "Иван",
        lastName: "Иванов",
        avatarUrl: "https://avatars.yandex.net/test",
      }),
      create: vi.fn().mockResolvedValue({
        _id: "user-123",
        email: "test@yandex.ru",
        firstName: "Иван",
        lastName: "Иванов",
        avatarUrl: "https://avatars.yandex.net/test",
      }),
      updateProfile: vi.fn(),
      updateAvatar: vi.fn(),
    };

    mockJwtService = {
      signAsync: vi.fn().mockResolvedValue("mock-jwt-token"),
      verifyAsync: vi.fn().mockResolvedValue({
        userId: "user-123",
        email: "test@yandex.ru",
        jti: "sess-1",
      }),
      decode: vi.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 900 }),
    };

    mockSessions = {
      create: vi.fn().mockResolvedValue(activeSession),
      findByJti: vi.fn().mockResolvedValue(activeSession),
      revoke: vi.fn().mockResolvedValue(undefined),
      revokeAllForUser: vi.fn().mockResolvedValue(2),
      matchesRefreshToken: vi.fn().mockReturnValue(true),
    };

    service = new YandexAuthService(
      mockConfigService as ConfigService,
      mockUsersService as UsersService,
      mockJwtService as JwtService,
      mockSessions as SessionService,
    );
  });

  describe("getAuthUrl", () => {
    it("builds Yandex OAuth authorize URL", () => {
      const url = service.getAuthUrl();
      expect(url).toContain("https://oauth.yandex.ru/authorize");
      expect(url).toContain("client_id=test-client-id");
      expect(url).toContain("response_type=code");
      expect(url).toContain(
        "redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fapi%2Fauth%2Fcallback",
      );
    });

    it("includes state when provided", () => {
      const url = service.getAuthUrl("mystate");
      expect(url).toContain("state=mystate");
    });
  });

  describe("handleCallback", () => {
    it("creates a new user and returns tokens", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("oauth.yandex.ru/token")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: "ya-token",
                expires_in: 3600,
                refresh_token: "ya-refresh",
                token_type: "Bearer",
              }),
          });
        }
        if (url.includes("login.yandex.ru/info")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: "ya-123",
                default_email: "test@yandex.ru",
                first_name: "Иван",
                last_name: "Иванов",
                default_avatar_id: "avatar-1",
              }),
          });
        }
        return Promise.resolve({ ok: false });
      }) as typeof fetch;

      const result = await service.handleCallback("test-code");

      expect(result.accessToken).toBe("mock-jwt-token");
      expect(result.refreshToken).toBe("mock-jwt-token");
      expect(mockUsersService.create).toHaveBeenCalledWith({
        yandexId: "ya-123",
        email: "test@yandex.ru",
        firstName: "Иван",
        lastName: "Иванов",
        avatarUrl: "https://avatars.yandex.net/get-yapic/avatar-1/islands-200",
      });
    });
  });

  describe("issueTokens", () => {
    it("записывает сессию и кладёт её идентификатор в access-токен", async () => {
      const user = { _id: "user-123", email: "test@yandex.ru", tokenVersion: 3 };

      const tokens = await service.issueTokens(user as never);

      expect(mockSessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jti: "test-uuid",
          userId: "user-123",
          refreshToken: "mock-jwt-token",
        }),
      );
      // access-токен несёт идентификатор сессии (sId) и версию токенов (ver),
      // refresh — тот же идентификатор под именем jti.
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sId: "test-uuid", ver: 3 }),
      );
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ jti: "test-uuid" }),
        expect.objectContaining({ expiresIn: "7d" }),
      );
      expect(tokens.refreshTokenMaxAge).toBeGreaterThan(0);
    });
  });

  describe("refreshTokens", () => {
    it("issues a new token pair when the refresh token is valid", async () => {
      const result = await service.refreshTokens("valid-refresh-token");

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
        "valid-refresh-token",
        expect.objectContaining({ secret: "test-secret-at-least-32-characters!!" }),
      );
      expect(mockUsersService.findById).toHaveBeenCalledWith("user-123");
      // Старая сессия отзывается до выдачи новой: иначе тот же токен проходит
      // ротацию дважды.
      expect(mockSessions.revoke).toHaveBeenCalledWith("sess-1");
      expect(mockSessions.create).toHaveBeenCalled();
      expect(result.accessToken).toBe("mock-jwt-token");
      expect(result.refreshToken).toBe("mock-jwt-token");
      expect(result.accessTokenMaxAge).toBeGreaterThan(0);
    });

    it("throws when the refresh token is invalid or expired", async () => {
      mockJwtService.verifyAsync = vi.fn().mockRejectedValue(new Error("expired"));

      await expect(service.refreshTokens("bad-token")).rejects.toThrow(
        "Invalid or expired refresh token",
      );
    });

    it("отбивает токен без идентификатора сессии", async () => {
      // Так выглядят токены, выпущенные до перехода на сессии: ротировать
      // нечего, записи в базе за ними нет.
      mockJwtService.verifyAsync = vi
        .fn()
        .mockResolvedValue({ userId: "user-123", email: "test@yandex.ru" });

      await expect(service.refreshTokens("legacy-token")).rejects.toThrow(
        "Invalid or expired refresh token",
      );
      expect(mockSessions.findByJti).not.toHaveBeenCalled();
    });

    it("отбивает токен, сессии которого нет в базе", async () => {
      mockSessions.findByJti = vi.fn().mockResolvedValue(null);

      await expect(service.refreshTokens("valid-refresh-token")).rejects.toThrow(
        "Invalid or expired refresh token",
      );
      expect(mockSessions.create).not.toHaveBeenCalled();
    });

    it("на повторном использовании отозванного токена отзывает все сессии", async () => {
      mockSessions.findByJti = vi
        .fn()
        .mockResolvedValue({ ...activeSession, revokedAt: new Date() });

      await expect(service.refreshTokens("used-refresh-token")).rejects.toThrow(
        "Refresh token has already been used",
      );
      // Повтор означает, что копия токена есть у кого-то ещё: различить
      // владельцев нечем, и цепочка обрывается целиком.
      expect(mockSessions.revokeAllForUser).toHaveBeenCalledWith("user-123");
      expect(mockSessions.create).not.toHaveBeenCalled();
    });

    it("отзывает все сессии, если значение токена не совпало с выданным", async () => {
      mockSessions.matchesRefreshToken = vi.fn().mockReturnValue(false);

      await expect(service.refreshTokens("forged-refresh-token")).rejects.toThrow(
        "Invalid or expired refresh token",
      );
      expect(mockSessions.revokeAllForUser).toHaveBeenCalledWith("user-123");
      expect(mockSessions.create).not.toHaveBeenCalled();
    });

    it("throws when the user no longer exists", async () => {
      mockUsersService.findById = vi.fn().mockRejectedValue(new Error("not found"));

      await expect(service.refreshTokens("valid-refresh-token")).rejects.toThrow(
        "User not found",
      );
      expect(mockSessions.revoke).not.toHaveBeenCalled();
    });
  });
});
