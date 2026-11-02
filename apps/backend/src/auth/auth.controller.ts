import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  Redirect,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiExcludeEndpoint } from "@nestjs/swagger";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { YandexAuthService } from "./yandex-auth.service";
import { UsersService } from "../users/users.service";
import { Public } from "./decorators/public.decorator";
import { DevLoginDto } from "./dto/dev-login.dto";
import type { TokenPair } from "./auth.types";

/**
 * Сравнение за постоянное время. `timingSafeEqual` требует буферов равной
 * длины, поэтому сравниваем не сами строки, а их sha256 — длина всегда 32
 * байта, и по времени ответа нельзя отличить «не тот логин» от «не тот пароль».
 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly yandexAuth: YandexAuthService,
    private readonly usersService: UsersService,
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

  /**
   * Локальный вход без OAuth: разработчику без Yandex-кредов иначе нечем войти
   * в браузере. Ожидаемая пара задаётся только в окружении (DEV_LOGIN_EMAIL /
   * DEV_LOGIN_PASSWORD), в базе и в коде паролей нет.
   *
   * Защита от попадания в бой — три границы: пустому паролю нечему совпасть,
   * маршрут отвечает 404 пока пароль не задан, а непустой пароль при
   * NODE_ENV=production роняет приложение на старте (см. env.schema.ts).
   * Режима «не проверять токен» здесь нет: сессия выдаётся обычная, а guard и
   * JwtStrategy работают как всегда.
   */
  /**
   * Проба доступности для модалки входа: 200 — форму можно показать, 404 —
   * локальный вход не настроен. Отдельный GET нужен потому, что глобальный
   * ValidationPipe отсекает POST с пустым телом (400) до обработчика, и пробой
   * сам POST служить не может — пришлось бы слать фиктивную попытку входа.
   */
  @Get("dev-login")
  @Public()
  @ApiExcludeEndpoint()
  devLoginAvailable() {
    this.assertDevLoginConfigured();
    return { available: true };
  }

  @Post("dev-login")
  @Public()
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  async devLogin(
    @Body() dto: DevLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { expectedEmail, expectedPassword } = this.assertDevLoginConfigured();

    // Обе сверки выполняются всегда: при `&&` неверный логин пропускал бы
    // проверку пароля, и время ответа выдавало бы, какое из полей не совпало.
    const emailMatches = safeEqual(dto.email, expectedEmail);
    const passwordMatches = safeEqual(dto.password, expectedPassword);

    if (!emailMatches || !passwordMatches) {
      this.logger.warn("dev-login: неверные учётные данные");
      throw new UnauthorizedException("Неверный логин или пароль");
    }

    const user = await this.usersService.findByEmail(expectedEmail);
    if (!user) {
      // Креды верны, но учётки нет: пользователя на ходу не создаём — это была
      // бы запись в БД по неаутентифицированному запросу.
      throw new ServiceUnavailableException(
        `Пользователь ${expectedEmail} не найден в локальной базе — выполните pnpm seed`,
      );
    }

    const tokens = await this.yandexAuth.issueTokens(user);
    this.setAuthCookies(res, tokens);

    return { success: true };
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

  /**
   * Пока пара кредов не задана целиком, маршрутов локального входа для клиента
   * не существует: оба отвечают 404.
   */
  private assertDevLoginConfigured() {
    const expectedEmail = this.configService.get<string>("DEV_LOGIN_EMAIL") ?? "";
    const expectedPassword = this.configService.get<string>("DEV_LOGIN_PASSWORD") ?? "";

    if (!expectedEmail || !expectedPassword) {
      throw new NotFoundException();
    }

    return { expectedEmail, expectedPassword };
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
