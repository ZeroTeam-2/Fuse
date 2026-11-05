import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { parseSpecText } from "../src/apps/spec-text-parser";

describe("parseSpecText", () => {
  it("разбирает JSON и YAML", () => {
    expect(parseSpecText('{"openapi":"3.0.0"}', "application/json")).toEqual({
      openapi: "3.0.0",
    });
    expect(parseSpecText("openapi: 3.0.0\n", "application/yaml")).toEqual({
      openapi: "3.0.0",
    });
  });

  it("пробует второй формат, если первый не подошёл", () => {
    // contentType врёт: тело JSON, заявлен YAML.
    expect(parseSpecText('{"openapi":"3.0.0"}', "application/yaml")).toEqual({
      openapi: "3.0.0",
    });
  });

  it("отказывается разбирать документ с якорями и алиасами", () => {
    const billionLaughs = [
      "a: &a [x, x, x, x, x, x, x, x, x]",
      "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]",
      "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]",
      "openapi: 3.0.0",
      "",
    ].join("\n");

    expect(() => parseSpecText(billionLaughs, "application/yaml")).toThrow(
      BadRequestException,
    );
    expect(() => parseSpecText(billionLaughs, "application/yaml")).toThrow(
      /anchors and aliases/,
    );
  });

  it("отказ по алиасам не уходит на повторный разбор как JSON", () => {
    // Без явного проброса BadRequestException документ ушёл бы во вторую попытку
    // и вернулся невнятным «not valid JSON or YAML».
    const aliased = "a: &a {k: v}\nb: *a\n";
    expect(() => parseSpecText(aliased, "application/json")).toThrow(
      /anchors and aliases/,
    );
  });

  it("повторяющееся значение без алиасов алиасом не считается", () => {
    const parsed = parseSpecText(
      "paths:\n  /a:\n    get:\n      summary: same\n  /b:\n    get:\n      summary: same\n",
      "application/yaml",
    );
    expect(parsed).toHaveProperty("paths");
  });

  it("не разбирает YAML-теги вне набора JSON", () => {
    // JSON_SCHEMA ограничивает теги типами JSON: !!timestamp больше не даёт Date.
    expect(() => parseSpecText("at: !!timestamp 2026-11-03\n", "application/yaml"))
      .toThrow(BadRequestException);
  });

  it("отбивает скаляр: спецификация обязана быть объектом", () => {
    expect(() => parseSpecText("just a string", "application/yaml")).toThrow(
      BadRequestException,
    );
  });
});
