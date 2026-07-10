import {
  Controller,
  Get,
  Query,
  Res,
  Redirect,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiExcludeEndpoint } from "@nestjs/swagger";
import type { Response } from "express";
import { YandexAuthService } from "./yandex-auth.service";
import { Public } from "./decorators/public.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly yandexAuth: YandexAuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get("login")
  @Public()
  @ApiExcludeEndpoint()
  @Redirect()
  login() {
    return { url: this.yandexAuth.getAuthUrl(), statusCode: 302 };
  }

  @Get("callback")
  @Public()
  @ApiExcludeEndpoint()
  async callback(
    @Query("code") code: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const appUrl = this.configService.get<string>("APP_URL") ?? "http://localhost:3000";

    if (error) {
      return res.redirect(`${appUrl}/login?error=cancelled`);
    }
    if (!code) {
      return res.redirect(`${appUrl}/login?error=missing_code`);
    }

    try {
      const { accessToken, refreshToken } = await this.yandexAuth.handleCallback(code);

      const isProd = process.env.NODE_ENV === "production";
      const cookieOpts = {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? ("none" as const) : ("lax" as const),
        path: "/",
      };

      res.cookie("access_token", accessToken, {
        ...cookieOpts,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refresh_token", refreshToken, {
        ...cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.redirect(appUrl);
    } catch (err) {
      this.logger.error(`OAuth callback failed: ${String(err)}`);
      return res.redirect(`${appUrl}/login?error=invalid_code`);
    }
  }

  @Get("logout")
  @ApiExcludeEndpoint()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return { success: true };
  }
}
