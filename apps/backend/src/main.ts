import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { IoAdapter } from "@nestjs/platform-socket.io";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json, urlencoded } from "express";
import type { Express } from "express";
import { AppModule } from "./app.module";
import { LoggingService } from "./logging/logging.service";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware";

async function bootstrap() {
  // bodyParser: false — Nest иначе регистрирует свой разборщик тела на старте,
  // со 100 КБ по умолчанию и первым в цепочке: явные лимиты ниже не применились
  // бы, тело к ним приходит уже разобранным.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const configService = app.get(ConfigService);
  const isProd = configService.get<string>("NODE_ENV") === "production";

  // Логгер приложения: до этой строки весь вывод шёл через ConsoleLogger, то есть
  // мимо маскирования email и токенов. Подключается первым делом, чтобы запись о
  // самом старте уже проходила через него.
  app.useLogger(app.get(LoggingService));

  app.enableShutdownHooks();

  app.setGlobalPrefix("api");

  // Первым в цепочке: ошибка в любом следующем middleware должна попадать в лог
  // уже с идентификатором запроса.
  app.use(requestIdMiddleware);

  app.use(
    helmet({
      // HSTS только в production. Заголовок, однажды полученный браузером с
      // localhost, заставит его требовать HTTPS от всех локальных портов на срок
      // max-age — разработка встанет, и почистить это можно только в настройках
      // браузера.
      hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      // CSP живёт на фронтенде (там нужен nonce для инлайнового скрипта гидрации).
      // На API политика смысла не несёт — ответы JSON, — зато ломает /api/docs,
      // который подтягивает скрипт справочника.
      contentSecurityPolicy: false,
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );

  const bodyLimit = `${configService.get<number>("REQUEST_BODY_MAX_MB") ?? 1}mb`;
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ limit: bodyLimit, extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(cookieParser());

  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  app.enableCors({
    origin: appUrl,
    credentials: true,
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  const expressApp = app.getHttpAdapter().getInstance() as Express;

  // Доверие к X-Forwarded-For. Без него req.ip равен адресу контейнера Caddy —
  // одинаковому для всех пользователей, — и ThrottlerGuard считает весь трафик
  // одним клиентом: лимит не защищает, а под нагрузкой выключает сервис.
  // Число хопов задаётся окружением (TRUST_PROXY_HOPS), потому что зависит от
  // схемы развёртывания: один Caddy — 1, CDN или балансировщик перед ним — больше.
  // Дефолт 0 — для `pnpm dev`, где перед бэкендом никого нет и заголовку верить
  // нельзя: иначе клиент сам назначает себе ключ лимита.
  expressApp.set("trust proxy", configService.get<number>("TRUST_PROXY_HOPS") ?? 0);

  // Health-check оркестратора. Зарегистрирован прямо на Express, вне маршрутов
  // Nest, поэтому глобальные guard'ы (включая ThrottlerGuard) его не видят — это
  // и есть исключение из лимита: docker опрашивает его каждые 15 секунд круглые
  // сутки с одного адреса. Отдельный @SkipThrottle тут не нужен и некуда вешать.
  expressApp.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Справочник API и схема — только вне production: оба маршрута открыты без
  // аутентификации и отдают полную карту API вместе со схемами тел запросов.
  // Генерация типов фронтенда (pnpm gen:types) ходит на локальный инстанс и этим
  // не затрагивается.
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Fuse API")
      .setDescription("Fuse backend REST API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    expressApp.get("/api/docs", apiReference({ spec: { content: document } }));
    expressApp.get("/api/schema.json", (_req, res) => {
      res.json(document);
    });
  }

  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  if (!isProd) {
    console.log(`Scalar API Docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
