import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Redirect,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiExcludeEndpoint } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { YandexAuthService } from "./yandex-auth.service";
import { Public } from "./decorators/public.decorator";
import type { TokenPair } from "./auth.types";

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
    const appUrl = this.configService.get<string>("APP_URL") ?? "http://localhost:5173";

    if (error) {
      return res.redirect(`${appUrl}/login?error=cancelled`);
    }
    if (!code) {
      return res.redirect(`${appUrl}/login?error=missing_code`);
    }

    try {
      const tokens = await this.yandexAuth.handleCallback(code);
      this.setAuthCookies(res, tokens);

      return res.redirect(appUrl);
    } catch (err) {
      this.logger.error(`OAuth callback failed: ${String(err)}`);
      return res.redirect(`${appUrl}/login?error=invalid_code`);
    }
  }

  @Post("refresh")
  @Public()
  @ApiExcludeEndpoint()
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.["refresh_token"];
    if (!refreshToken) {
      throw new UnauthorizedException("No refresh token");
    }

    const tokens = await this.yandexAuth.refreshTokens(refreshToken);
    this.setAuthCookies(res, tokens);

    return { success: true };
  }

  @Get("logout")
  @Public()
  @ApiExcludeEndpoint()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return { success: true };
  }

  private setAuthCookies(res: Response, tokens: TokenPair) {
    const isProd = process.env.NODE_ENV === "production";
    const cookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ("none" as const) : ("lax" as const),
      path: "/",
    };

    res.cookie("access_token", tokens.accessToken, {
      ...cookieOpts,
      maxAge: tokens.accessTokenMaxAge,
    });
    res.cookie("refresh_token", tokens.refreshToken, {
      ...cookieOpts,
      maxAge: tokens.refreshTokenMaxAge,
    });
  }
}
