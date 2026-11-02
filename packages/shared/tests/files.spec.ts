import { describe, it, expect } from "vitest";
import { ALLOWED_SPEC_EXTENSIONS, getExtension } from "../src/files";

describe("getExtension", () => {
  it("returns the extension with its leading dot", () => {
    expect(getExtension("report.json")).toBe(".json");
  });

  it("lowercases the extension", () => {
    expect(getExtension("A.YAML")).toBe(".yaml");
  });

  it("returns an empty string for a name without a dot", () => {
    expect(getExtension("readme")).toBe("");
  });

  it("treats a dotfile name as the extension", () => {
    expect(getExtension(".gitignore")).toBe(".gitignore");
  });

  it("takes the last dot", () => {
    expect(getExtension("archive.tar.gz")).toBe(".gz");
  });
});

describe("ALLOWED_SPEC_EXTENSIONS", () => {
  it("accepts json/yaml/yml and rejects anything else", () => {
    expect(ALLOWED_SPEC_EXTENSIONS.has(getExtension("spec.yml"))).toBe(true);
    expect(ALLOWED_SPEC_EXTENSIONS.has(getExtension("spec.txt"))).toBe(false);
  });
});
