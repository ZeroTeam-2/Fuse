import {
  Controller,
  Get,
  Query,
  Res,
  Redirect,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiExcludeEndpoint } from "@nestjs/swagger";
import type { Response } from "express";
import { YandexAuthService } from "./yandex-auth.service";
import { Public } from "./decorators/public.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly yandexAuth: YandexAuthService) {}

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
    @Res({ passthrough: true }) res: Response,
  ) {
    if (error) {
      throw new BadRequestException(`Authorization cancelled: ${error}`);
    }
    if (!code) {
      throw new BadRequestException("Missing authorization code");
    }

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

    return { success: true };
  }

  @Get("logout")
  @ApiExcludeEndpoint()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return { success: true };
  }
}
