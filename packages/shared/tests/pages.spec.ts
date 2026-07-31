import { describe, it, expect } from "vitest";
import {
  blockCategory,
  isDisplayBlock,
  isInputBlock,
  migrateStepPage,
  pageBlockCount,
  pageBlocks,
  validateFileAgainstBlock,
} from "../src/pages";
import type { PageBlock, StepPage } from "../src/types";

describe("validateFileAgainstBlock", () => {
  const block: PageBlock = {
    id: "dz",
    type: "dropzone",
    span: 6,
    accept: [".pdf", "image/png"],
    maxFileMb: 2,
  };

  it("passes a file matching an extension or a MIME type", () => {
    expect(validateFileAgainstBlock(block, { name: "Doc.PDF", type: "", size: 10 })).toBeNull();
    expect(validateFileAgainstBlock(block, { name: "shot.png", type: "image/png", size: 10 })).toBeNull();
  });

  it("rejects a file outside the accept list without starting the upload path", () => {
    const err = validateFileAgainstBlock(block, { name: "malware.exe", type: "application/x-msdownload", size: 10 });
    expect(err).toContain("Недопустимый формат");
    expect(err).toContain(".pdf");
  });

  it("rejects a file over maxFileMb", () => {
    const err = validateFileAgainstBlock(block, { name: "big.pdf", type: "application/pdf", size: 3 * 1024 * 1024 });
    expect(err).toContain("больше 2 МБ");
  });

  it("accepts anything when the block has no constraints", () => {
    const free: PageBlock = { id: "dz", type: "dropzone", span: 6 };
    expect(validateFileAgainstBlock(free, { name: "any.bin", type: "", size: 1e9 })).toBeNull();
  });
});

describe("block category", () => {
  it("treats paragraph as display and the rest as input", () => {
    expect(blockCategory("paragraph")).toBe("display");
    for (const t of ["input", "select", "dropzone", "richtext"] as const) {
      expect(blockCategory(t)).toBe("input");
    }
  });

  it("isInputBlock / isDisplayBlock agree with the category", () => {
    expect(isInputBlock({ id: "b", type: "input", span: 4 })).toBe(true);
    expect(isDisplayBlock({ id: "b", type: "paragraph", span: 4 })).toBe(true);
    expect(isInputBlock({ id: "b", type: "paragraph", span: 4 })).toBe(false);
  });
});

describe("pageBlocks / pageBlockCount", () => {
  it("flattens rows in order and counts blocks", () => {
    const page: StepPage = {
      title: "T",
      rows: [
        { id: "r1", items: [{ id: "a", type: "input", span: 2 }, { id: "b", type: "select", span: 2 }] },
        { id: "r2", items: [{ id: "c", type: "paragraph", span: 4 }] },
      ],
    };
    expect(pageBlocks(page).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(pageBlockCount(page)).toBe(3);
    expect(pageBlockCount(undefined)).toBe(0);
  });
});

describe("migrateStepPage", () => {
  it("converts a fields page into input blocks, keeping target as binding", () => {
    const page = migrateStepPage({
      type: "fields",
      title: "Данные",
      hint: "Заполните",
      buttonText: "Продолжить",
      fields: [
        { key: "инн", label: "ИНН", placeholder: "10 цифр", required: true, target: "inn" },
        { key: "comment", label: "Комментарий", required: false },
      ],
    });

    expect(page?.title).toBe("Данные");
    const blocks = pageBlocks(page);
    // Ведущий paragraph из hint + два input.
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "input", "input"]);
    expect(blocks[0].text).toBe("Заполните");
    expect(blocks[1]).toMatchObject({ type: "input", label: "ИНН", placeholder: "10 цифр", binding: "inn" });
    // buttonText отброшен; поле без target — без привязки.
    expect(blocks[2].binding).toBeUndefined();
  });

  it("converts a file page into a dropzone block, dropping accept/maxMb", () => {
    const page = migrateStepPage({
      type: "file",
      title: "Файл",
      hint: "Скан договора",
      accept: ".pdf",
      maxMb: 20,
      buttonText: "Загрузить",
    });
    const blocks = pageBlocks(page);
    expect(page?.title).toBe("Файл");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "dropzone", span: 6, label: "Скан договора" });
  });

  it("converts a text page into a paragraph block", () => {
    const page = migrateStepPage({ type: "text", title: "Итог", body: "Готово" });
    const blocks = pageBlocks(page);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "paragraph", text: "Готово" });
  });

  it("returns an already-new page unchanged", () => {
    const page: StepPage = { title: "T", rows: [{ id: "r", items: [{ id: "b", type: "input", span: 4 }] }] };
    expect(migrateStepPage(page)).toBe(page);
  });

  it("returns undefined for null or unknown shapes", () => {
    expect(migrateStepPage(null)).toBeUndefined();
    expect(migrateStepPage({ type: "mystery" })).toBeUndefined();
  });
});
