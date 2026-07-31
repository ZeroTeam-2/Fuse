import { describe, it, expect } from "vitest";
import {
  blockOutputKey,
  duplicateOutputKeys,
  pageStepSchema,
  OUTPUT_KEY_PATTERN,
} from "../src/pages";
import type { PageBlock, StepPage } from "../src/types";

function page(...blocks: PageBlock[]): StepPage {
  return { title: "Тест", rows: [{ id: "r1", items: blocks }] };
}

describe("pageStepSchema", () => {
  it("выводит выходы из блоков ввода: ключ — binding, иначе id; имя — ключ, иначе лейбл", () => {
    const schema = pageStepSchema(
      page(
        { id: "b1", type: "input", span: 3, binding: "inn", label: "ИНН" },
        { id: "b2", type: "select", span: 3, label: "Регион" },
        { id: "b3", type: "input", span: 3 },
      ),
    );

    expect(schema.outputs).toEqual([
      { key: "inn", label: "inn", type: "string" },
      { key: "b2", label: "Регион", type: "string" },
      { key: "b3", label: "b3", type: "string" },
    ]);
    expect(schema.inputs).toEqual([]);
    expect(schema.outputIsArray).toBe(false);
  });

  it("dropzone даёт выход типа file", () => {
    const schema = pageStepSchema(
      page({ id: "b1", type: "dropzone", span: 6, binding: "doc" }),
    );
    expect(schema.outputs).toEqual([{ key: "doc", label: "doc", type: "file" }]);
  });

  it("блоки отображения не попадают в выходы", () => {
    const schema = pageStepSchema(
      page(
        { id: "b1", type: "paragraph", span: 6, text: "Привет" },
        { id: "b2", type: "richtext", span: 6, binding: "note" },
      ),
    );
    expect(schema.outputs.map((f) => f.key)).toEqual(["note"]);
  });

  it("пустая страница — пустая схема", () => {
    expect(pageStepSchema(undefined).outputs).toEqual([]);
    expect(pageStepSchema({ title: "", rows: [] }).outputs).toEqual([]);
  });
});

describe("blockOutputKey / duplicateOutputKeys", () => {
  it("binding имеет приоритет над id", () => {
    expect(
      blockOutputKey({ id: "b1", type: "input", span: 6, binding: "inn" }),
    ).toBe("inn");
    expect(blockOutputKey({ id: "b1", type: "input", span: 6 })).toBe("b1");
  });

  it("находит дубликаты ключей среди блоков ввода", () => {
    const dupes = duplicateOutputKeys(
      page(
        { id: "b1", type: "input", span: 2, binding: "inn" },
        { id: "b2", type: "select", span: 2, binding: "inn" },
        { id: "b3", type: "input", span: 2, binding: "kpp" },
      ),
    );
    expect(dupes).toEqual(["inn"]);
  });

  it("блок отображения не конфликтует с ключами ввода", () => {
    const dupes = duplicateOutputKeys(
      page(
        { id: "b1", type: "input", span: 3, binding: "inn" },
        { id: "b2", type: "paragraph", span: 3, binding: "s0:inn" },
      ),
    );
    expect(dupes).toEqual([]);
  });

  it("паттерн ключа принимает идентификаторы и отклоняет прочее", () => {
    expect(OUTPUT_KEY_PATTERN.test("inn_2")).toBe(true);
    expect(OUTPUT_KEY_PATTERN.test("2inn")).toBe(false);
    expect(OUTPUT_KEY_PATTERN.test("s0:inn")).toBe(false);
    expect(OUTPUT_KEY_PATTERN.test("ключ")).toBe(false);
  });
});
