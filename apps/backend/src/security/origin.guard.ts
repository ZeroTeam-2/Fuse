import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { CSRF_SAFE_METHODS } from "./csrf.config";

/**
 * Проверка источника запроса для методов, меняющих состояние.
 *
 * Вторая линия к парному токену (`CsrfGuard`): токен можно потерять при
 * рефакторинге фронтенда, а заголовок источника браузер проставляет сам и
 * подделать его со страницы нельзя.
 *
 * **Заголовков нет — пропускаем.** Так выглядит не межсайтовый запрос, а вызов
 * не из браузера: SSR-сервер Nuxt ходит в API без `Origin` и без `Referer`, в
 * том числе `POST /api/auth/refresh` при рендере страницы, — правило «нет
 * заголовков → 403» выключило бы обновление сессии на SSR и выбрасывало бы
 * пользователя на логин при каждом обновлении страницы с истёкшим
 * access-токеном. Межсайтовая форма или fetch со страницы атакующего такой
 * запрос не изображают: браузер в обоих случаях проставляет `Origin` сам, и
 * убрать его из JS нельзя. Непустой источник, не совпавший с нашим, — отказ.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly logger = new Logger(OriginGuard.name);
  private readonly appOrigin: string;

  constructor(private readonly configService: ConfigService) {
    const appUrl = this.configService.get<string>("APP_URL") ?? "";
    this.appOrigin = toOrigin(appUrl);
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (CSRF_SAFE_METHODS.has(request.method)) return true;

    const stated = statedOrigin(request);
    if (!stated) return true;

    if (!this.isAllowed(stated, request)) {
      this.logger.warn(
        `Отказ по источнику: ${request.method} ${request.url} с ${stated}`,
      );
      throw new ForbiddenException("Запрос с постороннего источника отклонён");
    }

    return true;
  }

  /**
   * Свой источник — адрес фронтенда (`APP_URL`) и адрес самого API: за одним
   * Caddy это один и тот же хост, а в разработке на адрес API приходят запросы
   * из справочника `/api/docs`.
   */
  private isAllowed(stated: string, request: Request): boolean {
    if (this.appOrigin && stated === this.appOrigin) return true;

    const host = request.get("host");
    return host ? stated === `${request.protocol}://${host}` : false;
  }
}

/** `Origin`, а при его отсутствии — источник из `Referer`. */
function statedOrigin(request: Request): string {
  const origin = request.get("origin");
  // "null" присылает песочница iframe и страница с file:// — это не наш источник.
  if (origin) return origin;

  const referer = request.get("referer");
  return referer ? toOrigin(referer) : "";
}

function toOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}
