import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import type { JwtPayload } from "./auth.types";

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

  async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string }> {
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

    const payload: JwtPayload = {
      userId: user._id.toString(),
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: (this.configService.get<string>("JWT_REFRESH_EXPIRES") ?? "7d") as never,
    });

    return { accessToken, refreshToken };
  }
}
