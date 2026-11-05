import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCsrfUtilities } from "./csrf.config";
import { CSRF_UTILITIES } from "./security.tokens";

/**
 * Утилиты CSRF создаются один раз на приложение: секрет HMAC выводится из
 * `JWT_SECRET`, и пересоздание их на каждый запрос означало бы, что токен,
 * выданный одним запросом, не проходит проверку в следующем.
 *
 * Модуль глобальный: утилиты нужны и guard'у, зарегистрированному в
 * `AppModule`, и контроллеру аутентификации, который выдаёт токен.
 */
@Global()
@Module({
  providers: [
    {
      provide: CSRF_UTILITIES,
      useFactory: (configService: ConfigService) =>
        createCsrfUtilities({
          jwtSecret: configService.getOrThrow<string>("JWT_SECRET"),
          isProd: configService.get<string>("NODE_ENV") === "production",
        }),
      inject: [ConfigService],
    },
  ],
  exports: [CSRF_UTILITIES],
})
export class SecurityModule {}
