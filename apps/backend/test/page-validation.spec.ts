import { describe, it, expect } from "vitest";
import type { StepPage } from "@fuse/shared";
import {
  validatePage,
  isValidPage,
  createDefaultPage,
} from "../src/scenarios/page-validator";

describe("StepPage Validation", () => {
  it("passes for a layout with title and valid blocks", () => {
    const page: StepPage = {
      title: "Введите данные",
      rows: [
        {
          id: "r1",
          items: [
            { id: "b1", type: "input", span: 2, label: "ИНН" },
            { id: "b2", type: "select", span: 2, label: "Регион" },
          ],
        },
        {
          id: "r2",
          items: [{ id: "b3", type: "paragraph", span: 4, text: "Пояснение" }],
        },
      ],
    };
    expect(isValidPage(page)).toBe(true);
  });

  it("passes for an empty layout (no rows)", () => {
    expect(isValidPage({ title: "Пусто", rows: [] })).toBe(true);
  });

  describe("title", () => {
    it("fails without a title", () => {
      const page = { rows: [] };
      expect(validatePage(page)).toContain("page must have a title");
    });

    it("fails with a whitespace-only title", () => {
      const page = { title: "   ", rows: [] };
      expect(validatePage(page)).toContain("page must have a title");
    });
  });

  describe("rows and blocks", () => {
    it("fails when rows is missing", () => {
      const page = { title: "Заголовок" };
      expect(validatePage(page)).toContain("page must have rows");
    });

    it("fails for a row without blocks", () => {
      const page = { title: "Заголовок", rows: [{ id: "r1", items: [] }] };
      expect(validatePage(page)).toContain("row 0 must have at least one block");
    });

    it("fails for an unknown block type", () => {
      const page = {
        title: "Заголовок",
        rows: [{ id: "r1", items: [{ id: "b1", type: "widget", span: 2 }] }],
      };
      expect(validatePage(page)).toContain("row 0 block 0 has unknown type");
    });

    it("fails for span out of 1..6", () => {
      const page = {
        title: "Заголовок",
        rows: [{ id: "r1", items: [{ id: "b1", type: "input", span: 7 }] }],
      };
      expect(validatePage(page)).toContain("row 0 block 0 span must be 1..6");
    });

    it("fails for a non-integer span", () => {
      const page = {
        title: "Заголовок",
        rows: [{ id: "r1", items: [{ id: "b1", type: "input", span: 1.5 }] }],
      };
      expect(validatePage(page)).toContain("row 0 block 0 span must be 1..6");
    });
  });

  describe("invalid input", () => {
    it("fails for null", () => {
      expect(validatePage(null)).toContain("page must be an object");
    });
  });

  describe("createDefaultPage", () => {
    it("creates a valid empty page with the given title", () => {
      const page = createDefaultPage("Тест");
      expect(isValidPage(page)).toBe(true);
      expect(page.title).toBe("Тест");
      expect(page.rows).toEqual([]);
    });
  });
});
