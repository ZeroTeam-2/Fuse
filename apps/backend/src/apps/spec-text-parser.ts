/**
 * JSON/YAML detection + parsing for OpenAPI spec text — shared by the SSRF
 * guard (URL fetches) and the file-upload path. Kept free of Nest decorators
 * so backfill scripts can reuse it (like `base-url.ts`).
 */

import { JSON_SCHEMA, load } from "js-yaml";
import { BadRequestException } from "@nestjs/common";

type SpecFormat = "json" | "yaml";

/**
 * Документ с YAML-алиасами разбирать отказываемся.
 *
 * `JSON_SCHEMA` ограничивает *теги* типами JSON (отсекает `!!timestamp`, `!!binary`
 * и пользовательские), но алиасы не отключает — такой опции у js-yaml нет. Алиас
 * на коллекцию js-yaml разворачивает в ту же ссылку, поэтому сам разбор дешёвый, а
 * размножение («billion laughs») происходит позже — у первого, кто документ
 * обойдёт или сериализует: у dereference спецификации, у Mongo при записи, у
 * JSON.stringify в ответе.
 *
 * Отсюда и способ проверки: не разбор текста регулярками, а поиск повторно
 * встреченной ссылки в результате. Парсер без алиасов разделяемых ссылок не
 * создаёт, так что совпадение означает алиас — и наоборот. Обход идёт по
 * различным узлам, а не по развёрнутому дереву, поэтому он не размножается сам.
 */
function hasSharedReferences(root: unknown): boolean {
  const seen = new Set<object>();
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node !== "object" || node === null) continue;
    if (seen.has(node)) return true;
    seen.add(node);

    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      stack.push(child);
    }
  }

  return false;
}

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
    if (format === "json") return JSON.parse(text);

    const parsed = load(text, { schema: JSON_SCHEMA });
    if (hasSharedReferences(parsed)) {
      throw new BadRequestException(
        "Spec uses YAML anchors and aliases — inline them and upload again",
      );
    }
    return parsed;
  } catch (err) {
    // Отказ по алиасам — это ответ клиенту, а не «формат не подошёл»: иначе
    // документ уйдёт на вторую попытку разбора и вернётся невнятной ошибкой.
    if (err instanceof BadRequestException) throw err;
    return undefined;
  }
}

/**
 * Parses spec text as JSON or YAML, auto-detecting the format from
 * `contentType` (then content), retrying with the alternate format.
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
