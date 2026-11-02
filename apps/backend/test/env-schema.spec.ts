import { describe, it, expect } from "vitest";
import { validateEnv } from "../src/config/env.schema";

/** Минимум, без которого схема не проходит независимо от dev-входа. */
const baseEnv = {
  MONGODB_URL: "mongodb://localhost:27017/fuse",
  AWS_SQS_QUEUE_URL: "http://localhost:4566/000000000000/scenario-execution",
  JWT_SECRET: "test-secret-at-least-32-characters!!",
};

describe("envSchema: локальный вход без OAuth", () => {
  it("не требует DEV_LOGIN_* — по умолчанию пустые", () => {
    const env = validateEnv({ ...baseEnv });
    expect(env.DEV_LOGIN_EMAIL).toBe("");
    expect(env.DEV_LOGIN_PASSWORD).toBe("");
  });

  it("разрешает пару кредов вне production", () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: "development",
      DEV_LOGIN_EMAIL: "seed@fuse.local",
      DEV_LOGIN_PASSWORD: "devpassword",
    });
    expect(env.DEV_LOGIN_EMAIL).toBe("seed@fuse.local");
    expect(env.DEV_LOGIN_PASSWORD).toBe("devpassword");
  });

  it("падает, если пароль задан при NODE_ENV=production", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        NODE_ENV: "production",
        DEV_LOGIN_EMAIL: "seed@fuse.local",
        DEV_LOGIN_PASSWORD: "devpassword",
      }),
    ).toThrow(/DEV_LOGIN_PASSWORD/);
  });

  it("не мешает production, пока пароль пуст", () => {
    const env = validateEnv({
      ...baseEnv,
      NODE_ENV: "production",
      DEV_LOGIN_EMAIL: "seed@fuse.local",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.DEV_LOGIN_PASSWORD).toBe("");
  });
});
