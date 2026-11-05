import { randomUUID } from "node:crypto";
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import type { UserDocument } from "../users/user.schema";
import type { JwtPayload, TokenPair } from "./auth.types";
import { SessionService } from "./session.service";

interface YandexTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
}

interface YandexProfile {
  id: string;
  default_email?: string;
  first_name?: string;
  last_name?: string;
  default_avatar_id?: string;
}

const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
const YANDEX_PROFILE_URL = "https://login.yandex.ru/info";

@Injectable()
export class YandexAuthService {
  private readonly logger = new Logger(YandexAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly sessions: SessionService,
  ) {}

  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.get<string>("YANDEX_CLIENT_ID") ?? "",
      redirect_uri: this.configService.get<string>("YANDEX_REDIRECT_URI") ?? "",
      response_type: "code",
      ...(state ? { state } : {}),
    });
    return `${YANDEX_AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<TokenPair> {
    const clientId = this.configService.get<string>("YANDEX_CLIENT_ID");
    const clientSecret = this.configService.get<string>("YANDEX_CLIENT_SECRET");
    const redirectUri = this.configService.get<string>("YANDEX_REDIRECT_URI");

    if (!clientId || !clientSecret) {
      throw new UnauthorizedException("Yandex OAuth is not configured");
    }

    const tokenRes = await fetch(YANDEX_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri ?? "",
      }),
    });

    if (!tokenRes.ok) {
      this.logger.error(`Token exchange failed: ${tokenRes.status}`);
      throw new UnauthorizedException("Invalid or expired authorization code");
    }

    const tokenData = (await tokenRes.json()) as YandexTokenResponse;

    const profileRes = await fetch(
      `${YANDEX_PROFILE_URL}?format=json`,
      {
        headers: { Authorization: `OAuth ${tokenData.access_token}` },
      },
    );

    if (!profileRes.ok) {
      throw new UnauthorizedException("Failed to fetch Yandex profile");
    }

    const profile = (await profileRes.json()) as YandexProfile;

    const email = profile.default_email ?? `ya-${profile.id}@yandex.ru`;
    const firstName = profile.first_name ?? "";
    const lastName = profile.last_name ?? "";
    const avatarUrl = profile.default_avatar_id
      ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
      : undefined;

    let user = await this.usersService.findByYandexId(profile.id);
    if (!user) {
      user = await this.usersService.findByEmail(email);
    }

    if (user) {
      user = await this.usersService.updateProfile(user._id.toString(), {
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
      });
      if (avatarUrl && !user.avatarUrl) {
        user = await this.usersService.updateAvatar(user._id.toString(), avatarUrl);
      }
    } else {
      user = await this.usersService.create({
        yandexId: profile.id,
        email,
        firstName,
        lastName,
        avatarUrl,
      });
    }

    return this.issueTokens(user);
  }

  /**
   * Проверяет refresh-токен и выпускает новую пару access/refresh (ротация),
   * чтобы пользователь не разлогинивался при истечении access-токена (15 минут).
   *
   * Старая сессия при этом отзывается, и предъявить тот же refresh-токен второй
   * раз уже нельзя. Повторное предъявление означает, что копия токена есть у
   * кого-то ещё (утечка из хранилища браузера, перехват): различить, кто из
   * двоих законный владелец, нечем, поэтому отзывается вся цепочка сессий
   * пользователя — оба идут логиниться заново.
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>("JWT_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Токены, выпущенные до появления сессий, идентификатора не несут: ротация
    // по ним невозможна, сессии в базе за ними нет.
    if (!payload.jti) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const session = await this.sessions.findByJti(payload.jti);
    if (!session) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (session.revokedAt) {
      await this.revokeChain(session.userId, payload.jti, "предъявлен отозванный токен");
      throw new UnauthorizedException("Refresh token has already been used");
    }

    // Подпись верна, а значение — не то, что выдавалось этой сессии: так
    // выглядит подставленный токен с чужим `jti`.
    if (!this.sessions.matchesRefreshToken(session, refreshToken)) {
      await this.revokeChain(session.userId, payload.jti, "значение токена не совпало с выданным");
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.usersService.findById(session.userId).catch(() => null);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    await this.sessions.revoke(payload.jti);

    return this.issueTokens(user);
  }

  private async revokeChain(userId: string, jti: string, reason: string): Promise<void> {
    const revoked = await this.sessions.revokeAllForUser(userId);
    this.logger.warn(
      `Отзыв всех сессий пользователя ${userId} (${reason}, jti=${jti}): ${revoked}`,
    );
  }

  /**
   * Выпускает пару access/refresh для пользователя. Публичный, потому что этим
   * же кодом выдаёт сессию локальный вход по паролю (`POST /api/auth/dev-login`):
   * второй путь выдачи разошёлся бы с этим по TTL и флагам куки.
   */
  async issueTokens(user: UserDocument): Promise<TokenPair> {
    const userId = user._id.toString();
    // Один идентификатор на пару: в access-токене он зовётся sId, в
    // refresh-токене — jti, и обозначает одну и ту же запись сессии.
    const jti = randomUUID();

    const accessToken = await this.jwtService.signAsync({
      userId,
      email: user.email,
      sId: jti,
      ver: user.tokenVersion ?? 0,
    } satisfies JwtPayload);
    const refreshToken = await this.jwtService.signAsync(
      { userId, email: user.email, jti } satisfies JwtPayload,
      {
        expiresIn: (this.configService.get<string>("JWT_REFRESH_EXPIRES") ?? "7d") as never,
      },
    );

    const refreshTokenMaxAge = this.getRemainingMs(refreshToken);

    await this.sessions.create({
      jti,
      userId,
      refreshToken,
      expiresAt: new Date(Date.now() + refreshTokenMaxAge),
    });

    return {
      accessToken,
      refreshToken,
      accessTokenMaxAge: this.getRemainingMs(accessToken),
      refreshTokenMaxAge,
    };
  }

  /** Считает cookie maxAge из claim `exp` токена, чтобы cookie не жила дольше JWT. */
  private getRemainingMs(token: string): number {
    const decoded = this.jwtService.decode<{ exp?: number }>(token);
    if (!decoded?.exp) {
      return 0;
    }
    return Math.max(decoded.exp * 1000 - Date.now(), 0);
  }
}
