import { describe, it, expect, vi, beforeEach } from "vitest";
import { YandexAuthService } from "../src/auth/yandex-auth.service";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../src/users/users.service";

vi.mock("node:crypto", () => ({ randomUUID: () => "test-uuid" }));

describe("YandexAuthService", () => {
  let service: YandexAuthService;
  let mockConfigService: Partial<ConfigService>;
  let mockUsersService: Partial<UsersService>;
  let mockJwtService: Partial<JwtService>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigService = {
      get: vi.fn((key: string) => {
        const values: Record<string, string> = {
          YANDEX_CLIENT_ID: "test-client-id",
          YANDEX_CLIENT_SECRET: "test-secret",
          YANDEX_REDIRECT_URI: "http://localhost:3001/api/auth/callback",
          JWT_SECRET: "test-secret-at-least-32-characters!!",
          JWT_ACCESS_EXPIRES: "15m",
          JWT_REFRESH_EXPIRES: "7d",
        };
        return values[key] ?? "";
      }),
    };

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
      verifyAsync: vi.fn().mockResolvedValue({ userId: "user-123", email: "test@yandex.ru" }),
      decode: vi.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 900 }),
    };

    service = new YandexAuthService(
      mockConfigService as ConfigService,
      mockUsersService as UsersService,
      mockJwtService as JwtService,
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

  describe("refreshTokens", () => {
    it("issues a new token pair when the refresh token is valid", async () => {
      const result = await service.refreshTokens("valid-refresh-token");

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
        "valid-refresh-token",
        expect.objectContaining({ secret: "test-secret-at-least-32-characters!!" }),
      );
      expect(mockUsersService.findById).toHaveBeenCalledWith("user-123");
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

    it("throws when the user no longer exists", async () => {
      mockUsersService.findById = vi.fn().mockRejectedValue(new Error("not found"));

      await expect(service.refreshTokens("valid-refresh-token")).rejects.toThrow(
        "User not found",
      );
    });
  });
});
