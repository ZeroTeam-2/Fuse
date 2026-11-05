import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Controller, Get, INestApplication, Logger, Post, Req, Res } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { Request, Response } from "express";
import type { DoubleCsrfUtilities } from "csrf-csrf";
import request from "supertest";
import { createCsrfUtilities } from "../src/security/csrf.config";
import { CsrfGuard } from "../src/security/csrf.guard";
import { OriginGuard } from "../src/security/origin.guard";
import { SkipCsrf } from "../src/security/skip-csrf.decorator";

const APP_URL = "http://app.test";

/**
 * Утилиты лежат в переменной модуля, а не внедряются в контроллер:
 * конструкторная инъекция в vitest не работает (нет метаданных типов).
 */
let csrf: DoubleCsrfUtilities;

@Controller("probe")
class ProbeController {
  @Get("csrf-token")
  token(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { csrfToken: csrf.generateCsrfToken(req, res) };
  }

  @Post("write")
  write() {
    return { ok: true };
  }

  /** Как `POST /auth/refresh`: вызывается и SSR-сервером, парного токена у него нет. */
  @Post("ssr-refresh")
  @SkipCsrf()
  ssrRefresh() {
    return { ok: true };
  }

  @Get("read")
  read() {
    return { ok: true };
  }
}

describe("CSRF и проверка источника", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    Logger.overrideLogger(false);

    csrf = createCsrfUtilities({
      jwtSecret: "test-secret-at-least-32-characters!!",
      isProd: false,
    });

    app.use(cookieParser());

    const configService = {
      get: (key: string) => (key === "APP_URL" ? APP_URL : undefined),
    } as unknown as ConfigService;

    app.useGlobalGuards(
      new OriginGuard(configService),
      new CsrfGuard(csrf, new Reflector()),
    );

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("пропускает GET без токена", async () => {
    await request(app.getHttpServer()).get("/probe/read").expect(200);
  });

  it("отбивает POST без парного токена", async () => {
    const res = await request(app.getHttpServer()).post("/probe/write");

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain("CSRF");
  });

  it("пропускает POST с кукой и парным токеном в заголовке", async () => {
    const agent = request.agent(app.getHttpServer());

    const issued = await agent.get("/probe/csrf-token").expect(200);
    expect(issued.body.csrfToken).toBeTypeOf("string");
    // Кука ставится сервером и недоступна из JS: клиент хранит в памяти только
    // парный токен из тела ответа.
    expect(issued.headers["set-cookie"].join(";")).toContain("HttpOnly");

    await agent
      .post("/probe/write")
      .set("x-csrf-token", issued.body.csrfToken as string)
      .expect(201);
  });

  it("отбивает токен без соответствующей куки", async () => {
    // Токен, полученный атакующим в своём браузере, к куке жертвы не подходит:
    // проверяется именно их соответствие.
    const issued = await request(app.getHttpServer()).get("/probe/csrf-token");

    await request(app.getHttpServer())
      .post("/probe/write")
      .set("x-csrf-token", issued.body.csrfToken as string)
      .expect(403);
  });

  it("отбивает POST с посторонним Origin, даже с действующим токеном", async () => {
    const agent = request.agent(app.getHttpServer());
    const issued = await agent.get("/probe/csrf-token");

    const res = await agent
      .post("/probe/write")
      .set("Origin", "http://evil.test")
      .set("x-csrf-token", issued.body.csrfToken as string);

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain("посторонн");
  });

  it("пропускает POST с Origin фронтенда", async () => {
    const agent = request.agent(app.getHttpServer());
    const issued = await agent.get("/probe/csrf-token");

    await agent
      .post("/probe/write")
      .set("Origin", APP_URL)
      .set("x-csrf-token", issued.body.csrfToken as string)
      .expect(201);
  });

  it("отбивает POST, у которого посторонний только Referer", async () => {
    const agent = request.agent(app.getHttpServer());
    const issued = await agent.get("/probe/csrf-token");

    await agent
      .post("/probe/write")
      .set("Referer", "http://evil.test/page")
      .set("x-csrf-token", issued.body.csrfToken as string)
      .expect(403);
  });

  it("пропускает запрос без Origin и Referer — так ходит SSR", async () => {
    // Nuxt-сервер ходит в API без этих заголовков. Правило «нет заголовков →
    // 403» выключило бы обновление сессии при рендере страницы.
    const agent = request.agent(app.getHttpServer());
    const issued = await agent.get("/probe/csrf-token");

    await agent
      .post("/probe/write")
      .set("x-csrf-token", issued.body.csrfToken as string)
      .expect(201);
  });

  it("пропускает маршрут с @SkipCsrf без токена — это путь SSR-рефреша", async () => {
    await request(app.getHttpServer()).post("/probe/ssr-refresh").expect(201);
  });

  it("проверяет Origin и на маршруте с @SkipCsrf", async () => {
    // Снята только проверка парного токена; источник проверяется по-прежнему.
    await request(app.getHttpServer())
      .post("/probe/ssr-refresh")
      .set("Origin", "http://evil.test")
      .expect(403);
  });
});
