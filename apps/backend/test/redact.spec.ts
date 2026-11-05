import { describe, it, expect } from "vitest";
import { redactString, redactValue } from "../src/logging/redact";

describe("redactString", () => {
  it("маскирует email так, что он не восстанавливается", () => {
    const out = redactString("Пользователь ivan.petrov+tag@example.com не найден");
    expect(out).not.toContain("ivan.petrov");
    expect(out).not.toContain("example.com");
    expect(out).toContain("[redacted:email]");
  });

  it("маскирует JWT целиком, включая подпись", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1LTEifQ.4Xq-7Zb1kPd2LmTnQrSvUw8yAeCgIk";
    const out = redactString(`Authorization: Bearer ${jwt}`);
    expect(out).toContain("[redacted:jwt]");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).not.toContain("4Xq-7Zb1kPd2LmTnQrSvUw8yAeCgIk");
  });

  it("не трогает обычный текст", () => {
    expect(redactString("Run run-1 completed successfully")).toBe(
      "Run run-1 completed successfully",
    );
  });

  it("не принимает пакет@версию из путей pnpm за email", () => {
    // Иначе stack trace в логе маскируется целиком — там, где он и нужен.
    const frame =
      "at readStream (/app/node_modules/.pnpm/body-parser@2.2.0/node_modules/raw-body/index.js:163:17)";
    expect(redactString(frame)).toBe(frame);

    const nested =
      "/app/node_modules/.pnpm/@nestjs+common@11.1.27_class-validator@0.14.2/node_modules/x.js";
    expect(redactString(nested)).toBe(nested);
  });
});

describe("redactValue", () => {
  it("заменяет значения чувствительных полей целиком", () => {
    expect(
      redactValue({
        userId: "u-1",
        password: "fuse-local-dev-login",
        accessToken: "abc.def.ghi",
        refresh_token: "zzz",
        authorization: "Bearer abc",
        cookie: "access_token=abc",
      }),
    ).toEqual({
      userId: "u-1",
      password: "[redacted]",
      accessToken: "[redacted]",
      refresh_token: "[redacted]",
      authorization: "[redacted]",
      cookie: "[redacted]",
    });
  });

  it("обходит вложенные объекты и массивы", () => {
    expect(
      redactValue({ users: [{ email: "a@b.co", secret: "s" }] }),
    ).toEqual({ users: [{ email: "[redacted:email]", secret: "[redacted]" }] });
  });

  it("маскирует email в сообщении и stack ошибки", () => {
    const err = new Error("no user a@b.co");
    const out = redactValue(err) as { message: string; name: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("no user [redacted:email]");
  });

  it("не зацикливается на самоссылающемся объекте", () => {
    const node: Record<string, unknown> = { id: "1" };
    node.self = node;
    expect(redactValue(node)).toEqual({ id: "1", self: "[circular]" });
  });
});
