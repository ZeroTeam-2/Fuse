import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";

describe("Health check (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({}).compile();

    app = moduleRef.createNestApplication();

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get("/", (_req: unknown, res: { json: (d: unknown) => void }) => {
      res.json({ status: "ok" });
    });

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET / returns { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
