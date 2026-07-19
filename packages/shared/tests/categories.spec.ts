import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  CATEGORY_NAMES,
  findCategory,
  isValidCategory,
  isValidSubcategory,
} from "../src/categories";
import { StepType, RunStatus, HttpMethod, ParamLocation } from "../src/enums";

describe("Categories", () => {
  it("has at least 17 categories", () => {
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(17);
  });

  it("all categories have subcategories", () => {
    for (const cat of CATEGORIES) {
      expect(cat.subcategories.length).toBeGreaterThan(0);
    }
  });

  it("CATEGORY_NAMES matches CATEGORIES", () => {
    expect(CATEGORY_NAMES).toEqual(CATEGORIES.map((c) => c.name));
  });

  it("findCategory returns matching category", () => {
    const cat = findCategory("Документы");
    expect(cat).toBeDefined();
    expect(cat!.subcategories).toContain("Распознавание");
  });

  it("findCategory returns undefined for unknown", () => {
    expect(findCategory("Несуществующая")).toBeUndefined();
  });

  it("isValidCategory checks correctly", () => {
    expect(isValidCategory("Данные")).toBe(true);
    expect(isValidCategory("Несуществующая")).toBe(false);
  });

  it("isValidSubcategory checks correctly", () => {
    expect(isValidSubcategory("Документы", "Распознавание")).toBe(true);
    expect(isValidSubcategory("Документы", "Несуществующая")).toBe(false);
    expect(isValidSubcategory("Несуществующая", "Что-то")).toBe(false);
  });
});

describe("Enums", () => {
  it("StepType has all 6 types", () => {
    expect(Object.keys(StepType)).toHaveLength(6);
    expect(StepType.API).toBe("api");
    expect(StepType.SCENARIO).toBe("scenario");
    expect(StepType.DELAY).toBe("delay");
    expect(StepType.FILE).toBe("file");
    expect(StepType.PERIODIC).toBe("periodic");
    expect(StepType.PAGE).toBe("page");
  });

  it("RunStatus has 6 statuses", () => {
    expect(Object.keys(RunStatus)).toHaveLength(6);
    expect(RunStatus.PENDING).toBe("pending");
    expect(RunStatus.COMPLETED).toBe("completed");
    expect(RunStatus.FAILED).toBe("failed");
    expect(RunStatus.CANCELLED).toBe("cancelled");
  });

  it("HttpMethod has standard methods", () => {
    expect(HttpMethod.GET).toBe("GET");
    expect(HttpMethod.POST).toBe("POST");
    expect(HttpMethod.PUT).toBe("PUT");
    expect(HttpMethod.DELETE).toBe("DELETE");
    expect(HttpMethod.PATCH).toBe("PATCH");
  });

  it("ParamLocation has all locations", () => {
    expect(ParamLocation.PATH).toBe("path");
    expect(ParamLocation.QUERY).toBe("query");
    expect(ParamLocation.HEADER).toBe("header");
    expect(ParamLocation.BODY).toBe("body");
  });
});
