import { describe, it, expect, vi } from "vitest";
import { UploadsService } from "../src/uploads/uploads.service";
import { BadRequestException } from "@nestjs/common";

function createService(maxMb = 10) {
  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === "FILE_SINGLE_UPLOAD_MAX_MB") return maxMb;
      return undefined;
    }),
  };
  const mockSessionModel = {};
  const mockMinioService = {};
  return new UploadsService(
    mockSessionModel as never,
    mockMinioService as never,
    mockConfigService as never,
  );
}

describe("Upload mode detection", () => {
  describe("shouldUseChunked", () => {
    it("returns false for files at or below the threshold", () => {
      const service = createService(10);
      const tenMb = 10 * 1024 * 1024;

      expect(service.shouldUseChunked(tenMb)).toBe(false);
      expect(service.shouldUseChunked(tenMb - 1)).toBe(false);
      expect(service.shouldUseChunked(1)).toBe(false);
    });

    it("returns true for files above the threshold", () => {
      const service = createService(10);
      const tenMb = 10 * 1024 * 1024;

      expect(service.shouldUseChunked(tenMb + 1)).toBe(true);
      expect(service.shouldUseChunked(50 * 1024 * 1024)).toBe(true);
      expect(service.shouldUseChunked(1024 * 1024 * 1024)).toBe(true);
    });

    it("respects custom FILE_SINGLE_UPLOAD_MAX_MB", () => {
      const service = createService(50);
      const fiftyMb = 50 * 1024 * 1024;

      expect(service.shouldUseChunked(fiftyMb)).toBe(false);
      expect(service.shouldUseChunked(fiftyMb + 1)).toBe(true);
    });
  });

  describe("getMaxSingleUploadBytes", () => {
    it("returns the correct byte limit", () => {
      const service = createService(10);
      expect(service.getMaxSingleUploadBytes()).toBe(10 * 1024 * 1024);
    });

    it("respects custom limit", () => {
      const service = createService(25);
      expect(service.getMaxSingleUploadBytes()).toBe(25 * 1024 * 1024);
    });
  });
});

describe("Content type validation", () => {
  it("accepts common file types", () => {
    const service = createService();
    expect(service.isAllowedContentType("text/csv")).toBe(true);
    expect(service.isAllowedContentType("application/json")).toBe(true);
    expect(service.isAllowedContentType("application/pdf")).toBe(true);
    expect(service.isAllowedContentType("image/png")).toBe(true);
    expect(service.isAllowedContentType("image/jpeg")).toBe(true);
    expect(service.isAllowedContentType("video/mp4")).toBe(true);
    expect(service.isAllowedContentType("audio/mpeg")).toBe(true);
    expect(service.isAllowedContentType("text/plain")).toBe(true);
    expect(service.isAllowedContentType("application/zip")).toBe(true);
  });

  it("is case-insensitive", () => {
    const service = createService();
    expect(service.isAllowedContentType("TEXT/CSV")).toBe(true);
    expect(service.isAllowedContentType("Image/PNG")).toBe(true);
  });

  it("rejects disallowed file types", () => {
    const service = createService();
    expect(service.isAllowedContentType("application/x-msdownload")).toBe(false);
    expect(service.isAllowedContentType("text/html")).toBe(false);
    expect(service.isAllowedContentType("application/javascript")).toBe(false);
    expect(service.isAllowedContentType("")).toBe(false);
  });
});

describe("singleUpload size guard", () => {
  it("rejects files exceeding the single upload limit", async () => {
    const service = createService(10);
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);

    await expect(
      service.singleUpload("user-1", "big.bin", oversizedBuffer, "application/octet-stream"),
    ).rejects.toThrow(BadRequestException);
  });
});
