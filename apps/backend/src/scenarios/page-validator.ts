import type { StepPage } from "@fuse/shared";

export function validatePage(page: unknown): string[] {
  const errors: string[] = [];

  if (!page || typeof page !== "object") {
    return ["page must be an object"];
  }

  const p = page as Record<string, unknown>;

  switch (p.type) {
    case "fields":
      if (!p.title || typeof p.title !== "string") {
        errors.push("fields page must have a title");
      }
      if (!p.buttonText || typeof p.buttonText !== "string") {
        errors.push("fields page must have buttonText");
      }
      break;

    case "file":
      if (!p.title || typeof p.title !== "string") {
        errors.push("file page must have a title");
      }
      if (typeof p.maxMb !== "number" || p.maxMb <= 0) {
        errors.push("file page must have maxMb > 0");
      }
      break;

    case "text":
      if (!p.title || typeof p.title !== "string") {
        errors.push("text page must have a title");
      }
      if (!p.body || typeof p.body !== "string" || p.body.trim() === "") {
        errors.push("text page must have a non-empty body");
      }
      break;

    default:
      errors.push("unknown page type");
  }

  return errors;
}

export function isValidPage(page: unknown): boolean {
  return validatePage(page).length === 0;
}

export function createDefaultPage(
  type: StepPage["type"],
  title = "",
): StepPage {
  switch (type) {
    case "fields":
      return {
        type: "fields",
        title,
        hint: "",
        fields: [],
        buttonText: "Продолжить",
      };
    case "file":
      return {
        type: "file",
        title,
        hint: "",
        accept: "",
        maxMb: 10,
        buttonText: "Загрузить",
      };
    case "text":
      return {
        type: "text",
        title,
        body: "",
      };
  }
}
