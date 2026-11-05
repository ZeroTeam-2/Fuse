import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiExcludeEndpoint } from "@nestjs/swagger";
import type { DoubleCsrfUtilities } from "csrf-csrf";
import { THROTTLE_AUTH, THROTTLE_DEV_LOGIN } from "../security/throttle.config";
import type { CsrfTokenResponse } from "../security/csrf.config";
import { CSRF_UTILITIES } from "../security/security.tokens";
import { SkipCsrf } from "../security/skip-csrf.decorator";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { YandexAuthService } from "./yandex-auth.service";
import { SessionService } from "./session.service";
import { UsersService } from "../users/users.service";
import { Public } from "./decorators/public.decorator";
import { DevLoginDto } from "./dto/dev-login.dto";
import type { AuthenticatedRequest, TokenPair } from "./auth.types";
import {
  OAUTH_STATE_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  clearOAuthStateCookie,
  setAuthCookies,
  setOAuthStateCookie,
} from "./auth-cookies";

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
    private readonly sessions: SessionService,
    private readonly configService: ConfigService,
    @Inject(CSRF_UTILITIES) private readonly csrf: DoubleCsrfUtilities,
  ) {}

  /**
   * Выдаёт парный CSRF-токен: куку ставит сервер, сам токен уходит **телом**
   * ответа. Телом, а не кукой, потому что кука `HttpOnly` и из JS не читается —
   * клиент держит токен в памяти и присылает заголовком `x-csrf-token`.
   *
   * Маршрут публичный: токен нужен и до входа, форме локального входа.
   */
  @Get("csrf-token")
  @Public()
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  csrfToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): CsrfTokenResponse {
    return { csrfToken: this.csrf.generateCsrfToken(req, res) };
  }

  /**
   * Старт входа через Yandex. `state` — случайное значение, которое уходит в
   * OAuth-запрос и одновременно кладётся в короткоживущую httpOnly-куку: без
   * него callback принимает любой код авторизации, в том числе полученный
   * атакующим на свою учётку и подсунутый жертве (подмена аккаунта).
   *
   * Обработчик отвечает через `@Res`, а не `@Redirect`: декоратор до объекта
   * ответа не дотягивается, а куку ставить нужно именно здесь.
   */
  @Get("login")
  @Public()
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  login(@Res() res: Response) {
    const state = randomBytes(32).toString("hex");
    setOAuthStateCookie(res, state, this.isProd);

    return res.redirect(HttpStatus.FOUND, this.yandexAuth.getAuthUrl(state));
  }

  @Get("callback")
  @Public()
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  @Throttle({ default: THROTTLE_AUTH })
  async callback(
    @Query("code") code: string | undefined,
    @Query("error") error: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const appUrl = this.configService.get<string>("APP_URL") ?? "http://localhost:5173";

    // Кука одноразовая: убирается при любом исходе, иначе значение остаётся
    // пригодным для второй попытки.
    const expectedState = this.readCookie(req, OAUTH_STATE_COOKIE);
    clearOAuthStateCookie(res, this.isProd);

    if (error) {
      return res.redirect(`${appUrl}/login?error=cancelled`);
    }
    if (!code) {
      return res.redirect(`${appUrl}/login?error=missing_code`);
    }
    if (!state || !expectedState || !safeEqual(state, expectedState)) {
      this.logger.warn("OAuth callback: state не совпал с выданным");
      return res.redirect(`${appUrl}/login?error=invalid_state`);
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
  @Header("Cache-Control", "no-store")
  @Throttle({ default: THROTTLE_DEV_LOGIN })
  devLoginAvailable() {
    this.assertDevLoginConfigured();
    return { available: true };
  }

  @Post("dev-login")
  @Public()
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  @Throttle({ default: THROTTLE_DEV_LOGIN })
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

  /**
   * Обновление сессии. `@SkipCsrf` — единственное исключение из проверки
   * парного токена: этот маршрут вызывает не только браузер, но и SSR-сервер
   * Nuxt при рендере страницы, а держать парный токен ему негде. Защита при
   * этом остаётся: кука `SameSite=lax` на межсайтовый POST не уходит (без неё
   * здесь 401), и проверка `Origin` на маршрут по-прежнему распространяется.
   */
  @Post("refresh")
  @Public()
  @SkipCsrf()
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  @Throttle({ default: THROTTLE_AUTH })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = this.readCookie(req, REFRESH_TOKEN_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException("No refresh token");
    }

    let tokens: TokenPair;
    try {
      tokens = await this.yandexAuth.refreshTokens(refreshToken);
    } catch (err) {
      // Сессии больше нет: куки с мёртвыми токенами убираем, иначе браузер
      // присылает их до истечения срока и каждый запрос снова идёт в отказ.
      clearAuthCookies(res, this.isProd);
      throw err;
    }

    this.setAuthCookies(res, tokens);

    return { success: true };
  }

  /**
   * Выход. `POST`, а не `GET`: по `GET` сессию завершает любая картинка с
   * чужого сайта (`<img src=".../auth/logout">`). Маршрут не публичный —
   * отзывать нужно конкретную сессию, а её идентификатор приходит из
   * проверенного токена.
   */
  @Post("logout")
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  @Throttle({ default: THROTTLE_AUTH })
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.revoke(req.user.sId);
    clearAuthCookies(res, this.isProd);

    return { success: true };
  }

  /**
   * Выход на всех устройствах: отзываются все сессии пользователя, и версия
   * токенов увеличивается — выданные access-токены перестают действовать, не
   * дожидаясь истечения своих 15 минут.
   */
  @Post("logout-all")
  @ApiExcludeEndpoint()
  @Header("Cache-Control", "no-store")
  @Throttle({ default: THROTTLE_AUTH })
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const revoked = await this.sessions.revokeAllForUser(req.user.userId);
    await this.usersService.bumpTokenVersion(req.user.userId);
    clearAuthCookies(res, this.isProd);

    return { success: true, revokedSessions: revoked };
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

  private get isProd(): boolean {
    return this.configService.get<string>("NODE_ENV") === "production";
  }

  private readCookie(req: Request, name: string): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[name];
  }

  private setAuthCookies(res: Response, tokens: TokenPair) {
    setAuthCookies(res, tokens, this.isProd);
  }
}
