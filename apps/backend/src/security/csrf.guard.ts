import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { DoubleCsrfUtilities } from "csrf-csrf";
import type { Request } from "express";
import { CSRF_SAFE_METHODS } from "./csrf.config";
import { CSRF_UTILITIES } from "./security.tokens";
import { SKIP_CSRF_KEY } from "./skip-csrf.decorator";

/**
 * Проверка парного CSRF-токена у запросов, меняющих состояние.
 *
 * Глобальный guard, а не middleware на выбранных маршрутах: новый контроллер
 * иначе появляется незащищённым по умолчанию, а это ровно тот класс ошибок,
 * который замечают после инцидента.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(CSRF_UTILITIES) private readonly csrf: DoubleCsrfUtilities,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Handshake WebSocket приходит отдельным типом контекста, HTTP-запроса за
    // ним нет: проверять там нечего.
    if (context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (CSRF_SAFE_METHODS.has(request.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    if (!this.csrf.validateRequest(request)) {
      throw new ForbiddenException(
        "CSRF-токен отсутствует или не соответствует сессии — получите новый: GET /api/auth/csrf-token",
      );
    }

    return true;
  }
}
