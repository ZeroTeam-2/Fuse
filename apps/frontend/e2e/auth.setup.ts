/**
 * Вход в e2e без Yandex OAuth.
 *
 * Подписываем JWT тем же секретом (`JWT_SECRET`) и кладём его в ту же куку
 * (`access_token`), которую читает JwtStrategy бэкенда. Для приложения это
 * обычный авторизованный пользователь: guard, стратегия и проверка подписи
 * работают как всегда. Никакого режима «в dev не проверять токен» в коде нет и
 * быть не должно — иначе он однажды уедет в прод включённым.
 */
import { createHmac } from "node:crypto";
import { test as setup, expect } from "@playwright/test";
import { loadEnv, readSeed, STORAGE_STATE } from "./seed";

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

setup("вход под сид-пользователем", async ({ context }) => {
  loadEnv();

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET не задан — тесты не смогут подписать токен");

  const seed = readSeed();
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(
    { userId: seed.userId, email: seed.email, iat: now, exp: now + 60 * 60 },
    secret,
  );

  // Куки не различают порт, поэтому одна кука на localhost покрывает и фронт
  // (5173), и бэкенд (3001).
  await context.addCookies([
    {
      name: "access_token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // Убеждаемся, что бэкенд принял куку: иначе тесты упадут позже и непонятнее.
  const res = await context.request.get("http://localhost:3001/api/users/me");
  expect(res.status(), "бэкенд не принял подписанную куку").toBe(200);

  await context.storageState({ path: STORAGE_STATE });
});
