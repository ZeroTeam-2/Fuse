import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  NotFoundException,
  Post,
} from "@nestjs/common";
import { json } from "express";
import helmet from "helmet";
import request from "supertest";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { requestIdMiddleware } from "../src/common/middleware/request-id.middleware";
import { currentRequestId } from "../src/common/request-context";

/** Контроллер без зависимостей: конструкторная инъекция в vitest не работает. */
@Controller("probe")
class ProbeController {
  @Get("ok")
  ok() {
    return { status: "ok", requestId: currentRequestId() };
  }

  @Get("boom")
  boom() {
    // Не-HttpException: так выглядит CastError от Mongoose или ошибка драйвера с
    // куском строки подключения в тексте.
    throw new Error("E11000 duplicate key at mongodb://fuse:pwd@db.internal:27017");
  }

  @Get("missing")
  missing() {
    throw new NotFoundException("Scenario not found");
  }

  @Post("echo")
  echo(@Body() body: unknown) {
    return { received: typeof body };
  }
}

describe("HTTP hardening: заголовки, идентификатор запроса, фильтр исключений", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    // Фильтр пишет stack в лог — в выводе теста это шум от ожидаемой ошибки.
    Logger.overrideLogger(false);

    app.use(requestIdMiddleware);
    // Лимит тела — как в main.ts, явной границей вместо неявных 100 КБ Express.
    app.use(json({ limit: "100kb" }));
    app.use(
      helmet({
        // Вне production — как в main.ts.
        hsts: false,
        contentSecurityPolicy: false,
        frameguard: { action: "deny" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        crossOriginResourcePolicy: { policy: "same-origin" },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("отдаёт обязательный набор security-заголовков", async () => {
    const res = await request(app.getHttpServer()).get("/probe/ok");

    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("не выставляет HSTS вне production", async () => {
    const res = await request(app.getHttpServer()).get("/probe/ok");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("генерирует x-request-id и отдаёт его в ответе", async () => {
    const res = await request(app.getHttpServer()).get("/probe/ok");

    expect(res.headers["x-request-id"]).toMatch(/^[\w-]{8,128}$/);
    // Тот же идентификатор виден обработчику через AsyncLocalStorage.
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("использует входящий x-request-id, если он проходит проверку формата", async () => {
    const res = await request(app.getHttpServer())
      .get("/probe/ok")
      .set("x-request-id", "trace-from-proxy-42");

    expect(res.headers["x-request-id"]).toBe("trace-from-proxy-42");
  });

  it("заменяет входящий идентификатор недопустимого формата", async () => {
    // Проверка формата нужна потому, что значение приходит снаружи и попадает и
    // в заголовок ответа, и в строки лога: пробелы и разделители в нём означают
    // возможность подмешать в лог собственную запись.
    for (const bad of ["short", "has spaces; and=separators", "x".repeat(200)]) {
      const res = await request(app.getHttpServer())
        .get("/probe/ok")
        .set("x-request-id", bad);

      expect(res.headers["x-request-id"], bad).not.toBe(bad);
      expect(res.headers["x-request-id"], bad).toMatch(/^[\w-]{8,128}$/);
    }
  });

  it("отдаёт 500 без диагностики, но с идентификатором запроса", async () => {
    const res = await request(app.getHttpServer()).get("/probe/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      statusCode: 500,
      message: "Internal server error",
      requestId: res.headers["x-request-id"],
    });
    // Ни текста ошибки драйвера, ни строки подключения, ни stack.
    expect(JSON.stringify(res.body)).not.toContain("mongodb://");
    expect(JSON.stringify(res.body)).not.toContain("E11000");
    expect(res.body).not.toHaveProperty("stack");
  });

  it("сохраняет статус клиентской ошибки уровня Express (413 на большом теле)", async () => {
    // body-parser бросает не HttpException, а http-errors со status 413 и
    // expose: true. Без отдельной ветки в фильтре клиент получал бы 500 и терял
    // причину отказа.
    const res = await request(app.getHttpServer())
      .post("/probe/echo")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ x: "a".repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body.statusCode).toBe(413);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("прокидывает HttpException как есть — поведение обработчиков не меняется", async () => {
    const res = await request(app.getHttpServer()).get("/probe/missing");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Scenario not found");
  });
});
