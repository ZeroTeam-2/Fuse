import { describe, it, expect } from "vitest";
import { SsrfGuard } from "../src/apps/ssrf-guard";
import { BadRequestException } from "@nestjs/common";

describe("SsrfGuard", () => {
  const guard = new SsrfGuard();

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
});
