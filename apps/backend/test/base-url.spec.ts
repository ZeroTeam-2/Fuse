import { describe, it, expect } from "vitest";
import { deriveBaseUrl, joinBaseUrl } from "../src/apps/base-url";

describe("deriveBaseUrl", () => {
  it("uses an absolute servers[0].url and keeps its base path", () => {
    expect(
      deriveBaseUrl(
        { servers: [{ url: "https://api.example.com/v1" }] },
        "https://api.example.com/openapi.json",
      ),
    ).toBe("https://api.example.com/v1");
  });

  it("resolves a relative servers[0].url against the spec URL", () => {
    expect(
      deriveBaseUrl(
        { servers: [{ url: "/api/v2" }] },
        "https://api.example.com/docs/openapi.json",
      ),
    ).toBe("https://api.example.com/api/v2");
  });

  it("falls back to the spec origin when servers is absent (FastAPI)", () => {
    // Реальный кейс, на котором падала платформа: спека Fake Dadata не имеет
    // поля servers, из-за чего у приложения не было хоста вообще.
    expect(
      deriveBaseUrl({}, "https://dadata-fake.cloud.astral-dev.ru/openapi.json"),
    ).toBe("https://dadata-fake.cloud.astral-dev.ru");
  });

  it("supports swagger 2.0 host + basePath, taking the scheme from the spec URL", () => {
    expect(
      deriveBaseUrl(
        { host: "api.legacy.com", basePath: "/v1" },
        "https://api.legacy.com/swagger.json",
      ),
    ).toBe("https://api.legacy.com/v1");
  });

  it("strips a trailing slash", () => {
    expect(
      deriveBaseUrl(
        { servers: [{ url: "https://api.example.com/v1/" }] },
        "https://api.example.com/openapi.json",
      ),
    ).toBe("https://api.example.com/v1");
  });

  it("substitutes server variable defaults", () => {
    expect(
      deriveBaseUrl(
        {
          servers: [
            {
              url: "https://{region}.api.example.com/v1",
              variables: { region: { default: "eu" } },
            },
          ],
        },
        "https://api.example.com/openapi.json",
      ),
    ).toBe("https://eu.api.example.com/v1");
  });

  it("falls back to the origin when a server variable has no default", () => {
    expect(
      deriveBaseUrl(
        { servers: [{ url: "https://{region}.api.example.com" }] },
        "https://api.example.com/openapi.json",
      ),
    ).toBe("https://api.example.com");
  });

  it("returns undefined when the spec URL itself is unusable", () => {
    expect(deriveBaseUrl({}, "not-a-url")).toBeUndefined();
  });
});

describe("joinBaseUrl", () => {
  it("joins a path onto a bare origin", () => {
    expect(
      joinBaseUrl("https://dadata-fake.cloud.astral-dev.ru", "/collections"),
    ).toBe("https://dadata-fake.cloud.astral-dev.ru/collections");
  });

  it("preserves the app base path", () => {
    expect(joinBaseUrl("https://api.example.com/v1", "/collections")).toBe(
      "https://api.example.com/v1/collections",
    );
  });

  it("does not double up slashes", () => {
    expect(joinBaseUrl("https://api.example.com/v1/", "/collections")).toBe(
      "https://api.example.com/v1/collections",
    );
  });
});
