import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../../users/users.service";
import { ACCESS_TOKEN_COOKIE } from "../auth-cookies";
import type { AuthenticatedUser, JwtPayload } from "../auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { cookies?: Record<string, string> }) =>
          req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  /**
   * Подпись и срок токена проверены до этого метода; здесь проверяется то, чего
   * подпись не знает: не отозвана ли сессия и не обесценены ли все токены
   * пользователя («выйти везде»). Оба факта берутся одним запросом —
   * `findWithSession` достаёт пользователя вместе с его сессией, потому что
   * этот метод выполняется на каждом запросе к API.
   *
   * Токен без `sId` выпущен до перехода на сессии и доверия больше не имеет:
   * отозвать его нечем. Такие токены отбиваются — это и есть обещанный разрыв
   * сессий при переходе, пользователь логинится заново.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sId) {
      throw new UnauthorizedException("Token has no session");
    }

    const found = await this.usersService.findWithSession(payload.userId, payload.sId);
    if (!found) {
      throw new UnauthorizedException("User not found");
    }

    if (!found.sessionActive) {
      throw new UnauthorizedException("Session revoked");
    }

    if ((payload.ver ?? 0) !== found.tokenVersion) {
      throw new UnauthorizedException("Token is no longer valid");
    }

    return { userId: payload.userId, email: found.email, sId: payload.sId };
  }
}
