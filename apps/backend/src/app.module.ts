import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./config/env.schema";
import { throttlers } from "./security/throttle.config";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { MinioModule } from "./minio/minio.module";
import { WebSocketModule } from "./websocket/websocket.module";
import { ExecutionModule } from "./execution/execution.module";
import { AppsModule } from "./apps/apps.module";
import { ScenariosModule } from "./scenarios/scenarios.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { UploadsModule } from "./uploads/uploads.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { LoggingModule } from "./logging/logging.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { SecurityModule } from "./security/security.module";
import { CsrfGuard } from "./security/csrf.guard";
import { OriginGuard } from "./security/origin.guard";
import { EventsModule } from "./events/events.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env.local перекрывает .env (первый файл в списке выигрывает при коллизии
      // ключей): локальный профиль инфраструктуры включается созданием файла из
      // .env.local.example, выключается — его удалением. Боевой .env не трогаем.
      envFilePath: ["../../.env.local", "../../.env", ".env"],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>("MONGODB_URL"),
      }),
      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: (configService.get<string>("JWT_ACCESS_EXPIRES") || "15m") as never,
        },
      }),
      inject: [ConfigService],
    }),
    // Ограничение частоты запросов. Счётчики — в памяти процесса; точка
    // подключения внешнего хранилища и расчёт окон — security/throttle.config.ts.
    ThrottlerModule.forRoot({ throttlers }),
    // Шина событий API-процесса: публикация прямо в гейтвеи + BridgeTailer,
    // который подливает в них события воркер-процессов. Регистрируется ровно
    // здесь — модуль глобальный, потребители токен не импортируют.
    EventsModule.forApi(),
    // Утилиты CSRF — один экземпляр на приложение; модуль глобальный, его
    // провайдер нужен и guard'у ниже, и контроллеру аутентификации.
    SecurityModule,
    MinioModule,
    UsersModule,
    AuthModule,
    WebSocketModule,
    ExecutionModule,
    AppsModule,
    ScenariosModule,
    MarketplaceModule,
    UploadsModule,
    NotificationsModule,
    LoggingModule,
  ],
  providers: [
    // Порядок важен: лимит частоты проверяется до аутентификации, иначе поток
    // неаутентифицированных запросов всё равно доходит до разбора токена и до
    // запроса за пользователем в базу.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // После аутентификации: обе проверки относятся к запросам, меняющим
    // состояние, и ни одна не заменяет другую. OriginGuard смотрит на
    // заголовок, который браузер проставляет сам и подделать его со страницы
    // нельзя; CsrfGuard — на парный токен, который невозможно получить, не
    // прочитав ответ нашего же эндпоинта.
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
