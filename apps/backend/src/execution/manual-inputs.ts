import type {
  ManualInputDescriptor,
  PageBlock,
  RunStepResult,
  SchemaField,
  Step,
  StepPage,
  StepSchema,
} from "@fuse/shared";
import { isDisplayBlock, isInputBlock, pageBlocks } from "@fuse/shared";

/**
 * Перечисление значений сценария, помеченных ручным вводом, — параметров
 * (`mappings[key] = "user"`) и операндов условий фильтрации
 * (`filters[key].value.mode = "user"`).
 *
 * Один и тот же список строит форму запуска и проверяет полноту входов в
 * воркере: разъехаться «что спросили» и «что нужно при исполнении» не должны.
 */

/** Глубже вложенные сценарии не разворачиваем: недостающее спросим по ходу. */
const MAX_DEPTH = 5;

/** Ключ, под которым операнд условия приходит во входных данных шага. */
export function filterLocalKey(paramKey: string): string {
  return `filter:${paramKey}`;
}

/** Локальный ключ значения — то, что ищет `mapping-resolver` во входах шага. */
export function localKeyOf(paramKey: string, kind: "param" | "filter"): string {
  return kind === "filter" ? filterLocalKey(paramKey) : paramKey;
}

/** Префикс пути шага: `[2, 0]` → `s2.s0`. */
export function stepPathPrefix(stepPath: number[]): string {
  return stepPath.map((index) => `s${index}`).join(".");
}

/** Ключ во входах запуска: `s0:inn`, `s2.s0:filter:status`. */
export function manualInputKey(stepPath: number[], localKey: string): string {
  return `${stepPathPrefix(stepPath)}:${localKey}`;
}

/**
 * Входы, адресованные шагу: срез по префиксу пути со срезанным префиксом.
 * На выходе — плоская карта локальных ключей, ровно та, что ждёт резолвер.
 */
export function sliceInputsForStep(
  inputs: Record<string, unknown> | undefined,
  stepPath: number[],
): Record<string, unknown> {
  if (!inputs) return {};

  const prefix = `${stepPathPrefix(stepPath)}:`;
  const slice: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(inputs)) {
    if (key.startsWith(prefix)) {
      slice[key.slice(prefix.length)] = value;
    }
  }

  return slice;
}

/** Блоки ввода страницы — только они собирают значения шага. */
function pageInputBlocks(page: StepPage | undefined): PageBlock[] {
  return pageBlocks(page).filter(isInputBlock);
}

/**
 * Блок ввода закрывает значение шага, если привязан к нему через `binding`.
 * Блоки без привязки ничего не закрывают: их значение уйдёт во входы шага под
 * собственным `id`, не подменяя ручной параметр.
 */
export function pageCovers(step: Step, localKey: string): boolean {
  return pageInputBlocks(step.page).some((block) => block.binding === localKey);
}

/**
 * Данные страницы — из id блоков в локальные ключи значений шага. Значение
 * привязанного блока кладётся под его `binding`, непривязанного — под `id`.
 */
export function mapPageDataToLocalKeys(
  step: Step,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const bindings = new Map(
    pageInputBlocks(step.page)
      .filter((block) => block.binding)
      .map((block) => [block.id, block.binding as string]),
  );

  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    mapped[bindings.get(key) ?? key] = value;
  }

  return mapped;
}

/** Поле результата шага; массивный выход сводится к первому элементу. */
function readResultField(result: unknown, key: string): unknown {
  const source = Array.isArray(result) ? result[0] : result;
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

/**
 * Значения блоков отображения, разрешённые из результатов пройденных шагов, по
 * `blockId`. Привязка `s{idx}:{outKey}` читает поле результата шага-источника;
 * недоступный источник (нет шага/поля/результата) даёт `undefined` — блок
 * покажется пустым, шаг не упадёт.
 */
export function resolveDisplayBindings(
  page: StepPage | undefined,
  stepResults: RunStepResult[],
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const block of pageBlocks(page)) {
    if (!isDisplayBlock(block) || !block.binding) continue;

    const match = block.binding.match(/^s(\d+):(.+)$/);
    if (!match) continue;

    const value = readResultField(
      stepResults[Number(match[1])]?.result,
      match[2],
    );
    if (value !== undefined) resolved[block.id] = value;
  }

  return resolved;
}

export interface ManualInputDeps {
  /** Шаги сценария по id. Бросать не должен: недоступный сценарий — пустой список. */
  loadSteps(scenarioId: string): Promise<Step[]>;
  /** Схема шага; `null`, если шаг сломан (нет приложения или эндпоинта). */
  loadStepSchema(step: Step): Promise<StepSchema | null>;
}

/**
 * Тип и подпись операнда условия берутся из схемы ЭЛЕМЕНТА массива шага-источника:
 * сравнение идёт по полю элемента (`filter.field`), а не по выходу шага целиком.
 */
async function describeFilterField(
  step: Step,
  paramKey: string,
  siblings: Step[],
  deps: ManualInputDeps,
): Promise<SchemaField | undefined> {
  const filter = step.filters?.[paramKey];
  const source = step.mappings?.[paramKey];
  if (!filter || typeof source !== "string") return undefined;

  const match = source.match(/^s(\d+):(.+)$/);
  if (!match) return undefined;

  const sourceStep = siblings[Number(match[1])];
  if (!sourceStep) return undefined;

  const schema = await deps.loadStepSchema(sourceStep);
  if (!schema) return undefined;

  // arrayPath задан — массив лежит в поле результата, его элемент описан `items`.
  // Иначе массивом является сам результат, и `outputs` уже описывают элемент.
  const elementFields = filter.arrayPath
    ? (schema.outputs.find((f) => f.key === filter.arrayPath)?.items ?? [])
    : schema.outputs;

  return elementFields.find((f) => f.key === filter.field);
}

async function collectFromSteps(
  steps: Step[],
  stepPath: number[],
  visited: Set<string>,
  deps: ManualInputDeps,
  out: ManualInputDescriptor[],
): Promise<void> {
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const path = [...stepPath, index];

    if (step.type === "scenario") {
      if (visited.has(step.refScenarioId) || path.length >= MAX_DEPTH) {
        // Цикл между сценариями или слишком глубокая вложенность: обход обязан
        // быть конечным. Недостающие значения воркер спросит по ходу.
        continue;
      }

      const nested = await deps.loadSteps(step.refScenarioId);
      await collectFromSteps(
        nested,
        path,
        new Set([...visited, step.refScenarioId]),
        deps,
        out,
      );
      continue;
    }

    const mappings = step.mappings ?? {};
    const filters = step.filters ?? {};

    const hasManual =
      Object.values(mappings).some((source) => source === "user") ||
      Object.values(filters).some((filter) => filter.value?.mode === "user");

    if (!hasManual) continue;

    // Сломанный шаг (нет приложения/эндпоинта) не должен ронять экран запуска.
    const schema = await deps.loadStepSchema(step);
    const inputs = schema?.inputs ?? [];

    for (const [paramKey, source] of Object.entries(mappings)) {
      if (source !== "user") continue;

      const field = inputs.find((f) => f.key === paramKey);
      out.push({
        key: manualInputKey(path, paramKey),
        stepPath: path,
        stepIndex: index,
        stepTitle: step.title,
        paramKey,
        kind: "param",
        label: field?.label || paramKey,
        type: field?.type ?? "string",
        required: field?.required ?? false,
        source: pageCovers(step, paramKey) ? "page" : "form",
      });
    }

    for (const [paramKey, filter] of Object.entries(filters)) {
      if (filter.value?.mode !== "user") continue;

      const localKey = filterLocalKey(paramKey);
      const field = await describeFilterField(step, paramKey, steps, deps);

      out.push({
        key: manualInputKey(path, localKey),
        stepPath: path,
        stepIndex: index,
        stepTitle: step.title,
        paramKey,
        kind: "filter",
        label: field?.label || filter.field,
        type: field?.type ?? "string",
        // Без операнда условие не отберёт ни одного элемента и шаг упадёт.
        required: true,
        source: pageCovers(step, localKey) ? "page" : "form",
      });
    }
  }
}

export async function enumerateManualInputs(
  steps: Step[],
  deps: ManualInputDeps,
  scenarioId?: string,
): Promise<ManualInputDescriptor[]> {
  const out: ManualInputDescriptor[] = [];
  const visited = new Set<string>(scenarioId ? [scenarioId] : []);
  await collectFromSteps(steps, [], visited, deps, out);
  return out;
}

/** Значения, которые обязан дать сам пользователь: форма их и спрашивает. */
export function formInputs(
  descriptors: ManualInputDescriptor[],
): ManualInputDescriptor[] {
  return descriptors.filter((d) => d.source === "form");
}

/** Обязательные значения формы, которых нет во входах запуска. */
export function missingRequiredKeys(
  descriptors: ManualInputDescriptor[],
  inputs: Record<string, unknown> | undefined,
): string[] {
  return formInputs(descriptors)
    .filter((d) => d.required && isBlank(inputs?.[d.key]))
    .map((d) => d.key);
}

export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
