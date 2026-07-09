import { describe, it, expect } from "vitest";
import type { StepPage } from "@fuse/shared";
import { validatePage, isValidPage, createDefaultPage } from "../src/scenarios/page-validator";

describe("StepPage Validation", () => {
  describe("fields page", () => {
    it("passes with title and buttonText", () => {
      const page: StepPage = {
        type: "fields",
        title: "Введите данные",
        fields: [],
        buttonText: "Продолжить",
      };
      expect(isValidPage(page)).toBe(true);
    });

    it("fails without title", () => {
      const page = {
        type: "fields",
        fields: [],
        buttonText: "Продолжить",
      };
      expect(validatePage(page)).toContain("fields page must have a title");
    });

    it("fails without buttonText", () => {
      const page = {
        type: "fields",
        title: "Введите данные",
        fields: [],
      };
      expect(validatePage(page)).toContain("fields page must have buttonText");
    });
  });

  describe("file page", () => {
    it("passes with title and maxMb > 0", () => {
      const page: StepPage = {
        type: "file",
        title: "Загрузите документ",
        maxMb: 10,
        buttonText: "Загрузить",
      };
      expect(isValidPage(page)).toBe(true);
    });

    it("fails without title", () => {
      const page = {
        type: "file",
        maxMb: 10,
        buttonText: "Загрузить",
      };
      expect(validatePage(page)).toContain("file page must have a title");
    });

    it("fails with maxMb = 0", () => {
      const page = {
        type: "file",
        title: "Загрузите документ",
        maxMb: 0,
        buttonText: "Загрузить",
      };
      expect(validatePage(page)).toContain("file page must have maxMb > 0");
    });

    it("fails with negative maxMb", () => {
      const page = {
        type: "file",
        title: "Загрузите документ",
        maxMb: -5,
        buttonText: "Загрузить",
      };
      expect(validatePage(page)).toContain("file page must have maxMb > 0");
    });

    it("fails without maxMb", () => {
      const page = {
        type: "file",
        title: "Загрузите документ",
        buttonText: "Загрузить",
      };
      expect(validatePage(page)).toContain("file page must have maxMb > 0");
    });
  });

  describe("text page", () => {
    it("passes with title and non-empty body", () => {
      const page: StepPage = {
        type: "text",
        title: "Результат",
        body: "Операция завершена успешно",
      };
      expect(isValidPage(page)).toBe(true);
    });

    it("fails without title", () => {
      const page = {
        type: "text",
        body: "Какой-то текст",
      };
      expect(validatePage(page)).toContain("text page must have a title");
    });

    it("fails with empty body", () => {
      const page = {
        type: "text",
        title: "Результат",
        body: "",
      };
      expect(validatePage(page)).toContain(
        "text page must have a non-empty body",
      );
    });

    it("fails with whitespace-only body", () => {
      const page = {
        type: "text",
        title: "Результат",
        body: "   ",
      };
      expect(validatePage(page)).toContain(
        "text page must have a non-empty body",
      );
    });
  });

  describe("invalid input", () => {
    it("fails for null", () => {
      expect(validatePage(null)).toContain("page must be an object");
    });

    it("fails for unknown type", () => {
      const page = { type: "unknown" };
      expect(validatePage(page)).toContain("unknown page type");
    });
  });

  describe("createDefaultPage", () => {
    it("creates valid fields page", () => {
      const page = createDefaultPage("fields", "Тест");
      expect(isValidPage(page)).toBe(true);
      expect(page.type).toBe("fields");
    });

    it("creates valid file page with default maxMb 10", () => {
      const page = createDefaultPage("file", "Тест");
      expect(isValidPage(page)).toBe(true);
      expect(page.type).toBe("file");
      if (page.type === "file") {
        expect(page.maxMb).toBe(10);
      }
    });

    it("creates valid text page", () => {
      const page = createDefaultPage("text", "Тест");
      expect(page.type).toBe("text");
      if (page.type === "text") {
        expect(page.title).toBe("Тест");
      }
    });
  });
});
