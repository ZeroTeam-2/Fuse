/**
 * JSON/YAML detection + parsing for OpenAPI spec text — shared by the SSRF
 * guard (URL fetches) and the file-upload path. Kept free of Nest decorators
 * so backfill scripts can reuse it (like `base-url.ts`).
 */

import { load } from "js-yaml";
import { BadRequestException } from "@nestjs/common";

type SpecFormat = "json" | "yaml";

function detectFormat(text: string, contentType: string): SpecFormat {
  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("yaml")) return "yaml";
  const firstChar = text.trimStart()[0];
  if (firstChar === "{" || firstChar === "[") return "json";
  return "yaml";
}

function tryParse(text: string, format: SpecFormat): unknown {
  try {
    return format === "json" ? JSON.parse(text) : load(text);
  } catch {
    return undefined;
  }
}

/**
 * Parses spec text as JSON or YAML, auto-detecting the format from
 * `contentType` (then content), with fallback to the alternate format.
 * Throws `BadRequestException` if the result is not a plain object.
 */
export function parseSpecText(
  text: string,
  contentType: string,
): Record<string, unknown> {
  const primary = detectFormat(text, contentType);
  const secondary: SpecFormat = primary === "json" ? "yaml" : "json";

  let parsed: unknown = tryParse(text, primary);
  if (parsed === undefined) {
    parsed = tryParse(text, secondary);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new BadRequestException("Spec response is not valid JSON or YAML");
  }

  return parsed as Record<string, unknown>;
}
