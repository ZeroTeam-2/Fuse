import type {
  FilterOperator,
  RunStepResult,
  SchemaField,
  Step,
  StepFilter,
  StepFilterValue,
} from "@fuse/shared";
import { StepExecutionError } from "./execution-errors";

/** Разрешённые входы шага, разложенные по месту в HTTP-запросе. */
export interface LocatedInputs {
  path: Record<string, unknown>;
  query: Record<string, unknown>;
  header: Record<string, unknown>;
  body: Record<string, unknown>;
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  contains: "содержит",
};

/** Ключ, под которым пользовательское значение условия приходит во входных данных. */
export function filterInputKey(paramKey: string): string {
  return `filter:${paramKey}`;
}

export function resolveTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  // `:` входит в ключ: контекст шагов строится как `s0:access_token`.
  return template.replace(/\{\{([\w:]+)\}\}/g, (_match, key: string) => {
    const value = context[key];
    if (value === undefined || value === null) {
      return "";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

/**
 * Приведение операнда к типу ФАКТИЧЕСКОГО значения элемента, а не к типу из
 * схемы: схемы у воркера нет, а после переимпорта спеки она всё равно могла бы
 * разойтись с данными. UI при этом не даёт собрать бессмысленную комбинацию
 * (для boolean — только `=`/`≠`), но рантайм на это не полагается.
 */
export function matchesFilter(
  item: unknown,
  filter: StepFilter,
  operand: unknown,
): boolean {
  if (!item || typeof item !== "object") return false;

  const actual = (item as Record<string, unknown>)[filter.field];

  if (filter.op === "contains") {
    return String(actual ?? "")
      .toLowerCase()
      .includes(String(operand ?? "").toLowerCase());
  }

  if (typeof actual === "number") {
    const expected = Number(operand);
    if (Number.isNaN(expected)) return false;
    return compare(actual, expected, filter.op);
  }

  if (typeof actual === "boolean") {
    const expected = toBoolean(operand);
    if (expected === undefined) return false;
    return filter.op === "ne" ? actual !== expected : actual === expected;
  }

  return compare(String(actual ?? ""), String(operand ?? ""), filter.op);
}

function compare<T extends number | string>(
  actual: T,
  expected: T,
  op: FilterOperator,
): boolean {
  switch (op) {
    case "eq":
      return actual === expected;
    case "ne":
      return actual !== expected;
    case "gt":
      return actual > expected;
    case "lt":
      return actual < expected;
    case "gte":
      return actual >= expected;
    case "lte":
      return actual <= expected;
    default:
      return false;
  }
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").toLowerCase();
  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;
  return undefined;
}

/** Значение поля результата шага; массив без условия сужается до первого элемента. */
function readKey(result: unknown, key: string): unknown {
  const source = Array.isArray(result) ? result[0] : result;
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

function resolveFilterOperand(
  value: StepFilterValue,
  paramKey: string,
  stepResults: RunStepResult[],
  userInput?: Record<string, unknown>,
): unknown {
  if (value.mode === "const") {
    return resolveTemplate(value.const ?? "", buildTemplateContext(stepResults));
  }

  if (value.mode === "ref") {
    const match = value.ref?.match(/^s(\d+):(.+)$/);
    if (!match) return undefined;
    return readKey(stepResults[Number(match[1])]?.result, match[2]);
  }

  return userInput?.[filterInputKey(paramKey)];
}

/**
 * Сужает массивный выход шага-источника до одного элемента и достаёт из него `key`.
 * Пустая выборка — доменная ошибка: тихо подставить `undefined` значит сломать
 * сценарий на несколько шагов позже, в неочевидном месте.
 */
function resolveStepRef(
  result: unknown,
  key: string,
  paramKey: string,
  step: Step,
  stepResults: RunStepResult[],
  userInput: Record<string, unknown> | undefined,
  warnings: string[],
): unknown {
  const filter = step.filters?.[paramKey];

  let container: unknown = result;
  if (filter?.arrayPath) {
    container =
      result && typeof result === "object"
        ? (result as Record<string, unknown>)[filter.arrayPath]
        : undefined;

    if (!Array.isArray(container)) {
      // Спеку переимпортировали, поле-список переехало — не падаем, но и не молчим.
      warnings.push(
        `Параметр «${paramKey}»: поле «${filter.arrayPath}» в результате шага не является массивом — условие не применено`,
      );
      return readKey(result, key);
    }
  }

  if (!Array.isArray(container)) {
    return readKey(container, key);
  }

  if (!filter) {
    // Сценарий настроен до появления фильтров: первый элемент лучше, чем undefined.
    return readKey(container, key);
  }

  const operand = resolveFilterOperand(filter.value, paramKey, stepResults, userInput);
  const matches = container.filter((item) => matchesFilter(item, filter, operand));

  if (matches.length === 0) {
    throw new StepExecutionError(
      `Шаг «${step.title}», параметр «${paramKey}»: условие «${filter.field} ${OPERATOR_LABELS[filter.op]} ${String(operand ?? "")}» не отобрало ни одного элемента из ${container.length}`,
    );
  }

  if (matches.length > 1) {
    warnings.push(
      `Параметр «${paramKey}»: условию «${filter.field} ${OPERATOR_LABELS[filter.op]} ${String(operand ?? "")}» соответствует элементов: ${matches.length} — взят первый`,
    );
  }

  return readKey(matches[0], key);
}

export function resolveMappings(
  step: Step,
  stepResults: RunStepResult[],
  userInput?: Record<string, unknown>,
  warnings: string[] = [],
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const mappings = step.mappings ?? {};

  for (const [field, source] of Object.entries(mappings)) {
    if (source === "user") {
      resolved[field] = userInput?.[field] ?? userInput;
      continue;
    }

    if (source === "const") {
      const rawValue = (step.consts ?? {})[field];

      if (typeof rawValue === "string") {
        resolved[field] = resolveTemplate(rawValue, buildTemplateContext(stepResults));
      } else {
        resolved[field] = rawValue;
      }
      continue;
    }

    const stepRefMatch = source.match(/^s(\d+):(.+)$/);
    if (stepRefMatch) {
      const sr = stepResults[Number(stepRefMatch[1])];
      if (sr?.result && typeof sr.result === "object") {
        resolved[field] = resolveStepRef(
          sr.result,
          stepRefMatch[2],
          field,
          step,
          stepResults,
          userInput,
          warnings,
        );
      }
      continue;
    }

    resolved[field] = source;
  }

  return resolved;
}

/**
 * Раскладывает плоский результат `resolveMappings` по месту в запросе.
 *
 * Без этого шага значения никуда не попадают: сборка запроса ждёт
 * `resolved.path` / `resolved.query` / `resolved.headers`, а резолвер отдаёт
 * плоскую карту по ключам полей — поэтому path- и query-параметры не
 * подставлялись вообще, и в URL уезжал литеральный `{guid}`.
 *
 * Место берётся из схемы эндпоинта (`SchemaField.loc`), но плейсхолдер в пути
 * важнее схемы: если в шаблоне есть `{guid}`, значение обязано уехать в путь,
 * даже если схема разошлась с реальностью после переимпорта.
 */
export function groupInputsByLocation(
  resolved: Record<string, unknown>,
  inputs: SchemaField[],
  pathTemplate: string,
): LocatedInputs {
  const locations = new Map(inputs.map((f) => [f.key, f.loc ?? "body"]));
  const groups: LocatedInputs = { path: {}, query: {}, header: {}, body: {} };

  for (const [key, value] of Object.entries(resolved)) {
    const loc = pathTemplate.includes(`{${key}}`)
      ? "path"
      : (locations.get(key) ?? "body");
    groups[loc as keyof LocatedInputs][key] = value;
  }

  return groups;
}

export function buildTemplateContext(
  stepResults: RunStepResult[],
): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  for (let i = 0; i < stepResults.length; i++) {
    const sr = stepResults[i];
    if (sr.result && typeof sr.result === "object") {
      const result = sr.result as Record<string, unknown>;
      for (const [k, v] of Object.entries(result)) {
        context[`s${i}:${k}`] = v;
      }
    }
  }
  return context;
}
