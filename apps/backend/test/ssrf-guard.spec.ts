import { describe, it, expect, vi, afterEach } from "vitest";
import { SsrfGuard } from "../src/apps/ssrf-guard";
import { BadRequestException } from "@nestjs/common";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]),
}));

describe("SsrfGuard", () => {
  const mockConfigService = {
    get: vi.fn((key: string) =>
      key === "SPEC_URL_FETCH_MAX_MB" ? 10 : undefined,
    ),
  };
  const guard = new SsrfGuard(mockConfigService as never);

  describe("validateUrl", () => {
    it("accepts valid HTTPS URLs", () => {
      expect(() => guard.validateUrl("https://api.example.com/openapi.json")).not.toThrow();
    });

    it("rejects non-HTTP(S) protocols", () => {
      expect(() => guard.validateUrl("file:///etc/passwd")).toThrow(BadRequestException);
      expect(() => guard.validateUrl("ftp://example.com")).toThrow(BadRequestException);
    });

    it("rejects localhost", () => {
      expect(() => guard.validateUrl("http://localhost:8080/api.json")).toThrow(BadRequestException);
      expect(() => guard.validateUrl("http://127.0.0.1:8080/api.json")).toThrow(BadRequestException);
    });

    it("rejects private IP ranges", () => {
      expect(() => guard.validateUrl("http://192.168.1.1/api.json")).toThrow(BadRequestException);
      expect(() => guard.validateUrl("http://10.0.0.1/api.json")).toThrow(BadRequestException);
      expect(() => guard.validateUrl("http://172.16.0.1/api.json")).toThrow(BadRequestException);
    });

    it("rejects 169.254.x (link-local)", () => {
      expect(() => guard.validateUrl("http://169.254.169.254/latest/meta-data")).toThrow(BadRequestException);
    });

    it("allows hosts listed in SSRF_ALLOWED_HOSTS", () => {
      const prev = process.env.SSRF_ALLOWED_HOSTS;
      process.env.SSRF_ALLOWED_HOSTS = "localhost,127.0.0.1";
      try {
        expect(() => guard.validateUrl("http://localhost:8085/post")).not.toThrow();
        expect(() => guard.validateUrl("http://127.0.0.1:8085/post")).not.toThrow();
        // Не входящий в список приватный хост по-прежнему блокируется.
        expect(() => guard.validateUrl("http://192.168.1.1/api.json")).toThrow(BadRequestException);
      } finally {
        if (prev === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
        else process.env.SSRF_ALLOWED_HOSTS = prev;
      }
    });
  });

  describe("fetchSpec", () => {
    const url = "https://api.example.com/openapi.json";

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function mockFetch(text: string, contentType: string): void {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(text, {
            status: 200,
            headers: { "content-type": contentType },
          }),
        ),
      );
    }

    it("parses JSON spec with application/json content-type", async () => {
      mockFetch(JSON.stringify({ openapi: "3.0.0", info: { title: "Test" } }), "application/json");
      const result = await guard.fetchSpec(url);
      expect(result).toEqual({ openapi: "3.0.0", info: { title: "Test" } });
    });

    it("parses YAML spec with application/yaml content-type", async () => {
      mockFetch("openapi: \"3.0.0\"\ninfo:\n  title: \"Test\"\n", "application/yaml");
      const result = await guard.fetchSpec(url);
      expect(result).toEqual({ openapi: "3.0.0", info: { title: "Test" } });
    });

    it("parses YAML spec with text/plain content-type via body sniffing", async () => {
      mockFetch("openapi: \"3.0.0\"\ninfo:\n  title: \"Test\"\n", "text/plain");
      const result = await guard.fetchSpec(url);
      expect(result).toEqual({ openapi: "3.0.0", info: { title: "Test" } });
    });

    it("falls back to YAML when JSON parse fails on YAML body with json content-type", async () => {
      mockFetch("openapi: \"3.0.0\"\ninfo:\n  title: \"Test\"\n", "application/json");
      const result = await guard.fetchSpec(url);
      expect(result).toEqual({ openapi: "3.0.0", info: { title: "Test" } });
    });

    it("throws when body is invalid in both formats", async () => {
      mockFetch("key:\n\tvalue", "text/plain");
      await expect(guard.fetchSpec(url)).rejects.toThrow("Spec response is not valid JSON or YAML");
    });

    it("throws BadRequestException when parsed result is not an object", async () => {
      mockFetch("just a string\n", "text/plain");
      await expect(guard.fetchSpec(url)).rejects.toThrow(BadRequestException);
    });
  });
});
