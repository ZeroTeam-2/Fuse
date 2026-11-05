import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  hasDegenerateAlphabet,
  isPlaceholderSecret,
  isRevokedSecret,
  REVOKED_SECRET_HASHES,
} from "../src/config/secret-policy";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

describe("isRevokedSecret", () => {
  it("узнаёт значение по хэшу из переданного списка", () => {
    const revoked = new Set([sha256("compromised-value")]);
    expect(isRevokedSecret("compromised-value", revoked)).toBe(true);
    expect(isRevokedSecret("rotated-value", revoked)).toBe(false);
  });

  it("не считает пустое значение отозванным — это забота проверки на плейсхолдер", () => {
    expect(isRevokedSecret("", new Set([sha256("")]))).toBe(false);
  });

  it("не трогает свежее значение против боевого списка", () => {
    expect(isRevokedSecret(sha256(String(Date.now())))).toBe(false);
  });

  /**
   * Список отозванных значений — данные инцидента, не деталь реализации: его
   * сокращение означает, что утёкший секрет снова принимается. Хэши сверены с
   * таблицей в openspec/changes/harden-security-posture/tasks.md (1.9).
   */
  it("содержит все семь отозванных значений", () => {
    expect([...REVOKED_SECRET_HASHES].sort()).toEqual(
      [
        "ed46c443893b686ff123ba490534dba602cacc32262b35ee263444214a12e3ed",
        "0478a4966e517e2170aa73ecf6639af8a76460907894814aabaa3089505cd92a",
        "9093f87aeaa188be5771708ac18f3b213d5e1b18901325f72d1a319e36ae5acf",
        "82100458573677ff1c7cf23fa667ddfe1b144a786fbc241364fbe02ca48d7f04",
        "bcb5442c6837f8de7e65cb748459052c9f0d739e7edfb2b3ac5b6d795e09e387",
        "ba2a655f52a7110c6f6e50b6542583cec6c563ab51ae7648bf406729c60ed9ed",
        "67b10701b534be9b9908f01f2dd1821237bb70189a69eb6199aaa57c4535acdd",
      ].sort(),
    );
  });
});

describe("isPlaceholderSecret", () => {
  it("узнаёт инструкции из образцов окружения", () => {
    for (const value of [
      "",
      "   ",
      "<generate-via-openssl-rand-hex-48>",
      "<openssl rand -hex 48>",
      "test",
      "minioadmin",
      "fuse-local-dev-secret",
      "your-client-secret",
      "xxx",
    ]) {
      expect(isPlaceholderSecret(value), value).toBe(true);
    }
  });

  it("не отбивает осмысленный секрет из-за подстроки", () => {
    for (const value of [
      "AKIA7TJ4QZPL2WN6XC3D",
      "test-secret-at-least-32-characters!!",
      "GK31c2f218a2e44f485b94239e",
    ]) {
      expect(isPlaceholderSecret(value), value).toBe(false);
    }
  });
});

describe("hasDegenerateAlphabet", () => {
  it("отбивает значение нужной длины из повторяющихся символов", () => {
    expect(hasDegenerateAlphabet("a".repeat(48))).toBe(true);
    expect(hasDegenerateAlphabet("ab".repeat(24))).toBe(true);
  });

  it("пропускает случайное значение", () => {
    expect(hasDegenerateAlphabet(sha256("fuse"))).toBe(false);
    expect(hasDegenerateAlphabet("test-secret-at-least-32-characters!!")).toBe(false);
  });
});
