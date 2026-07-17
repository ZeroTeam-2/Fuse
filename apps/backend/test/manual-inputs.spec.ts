import { describe, it, expect } from "vitest";
import type { SchemaField, Step, StepPage, StepSchema } from "@fuse/shared";
import {
  enumerateManualInputs,
  mapPageDataToLocalKeys,
  missingRequiredKeys,
  sliceInputsForStep,
  type ManualInputDeps,
} from "../src/execution/manual-inputs";

function apiStep(
  title: string,
  extra: Partial<Step> & Record<string, unknown> = {},
): Step {
  return {
    id: title,
    title,
    type: "api",
    appId: "a1",
    endpointId: "e1",
    method: "GET",
    path: "/test",
    ...extra,
  } as Step;
}

function deps(
  schemas: Record<string, StepSchema | null> = {},
  scenarios: Record<string, Step[]> = {},
): ManualInputDeps {
  return {
    loadSteps: async (scenarioId) => scenarios[scenarioId] ?? [],
    loadStepSchema: async (step) =>
      step.id in schemas
        ? schemas[step.id]
        : { inputs: [], outputs: [], outputIsArray: false },
  };
}

const INN_FIELD: SchemaField = {
  key: "inn",
  label: "ИНН организации",
  type: "string",
  required: true,
};

describe("enumerateManualInputs", () => {
  it("collects manual params and filter operands across all steps", async () => {
    const steps = [
      apiStep("Организации", { mappings: {} }),
      apiStep("Заказы", {
        mappings: { orgId: "s0:id" },
        filters: {
          orgId: { field: "inn", op: "eq", value: { mode: "user" } },
        },
      }),
      apiStep("Письмо", { mappings: { subject: "user" } }),
    ];

    const result = await enumerateManualInputs(
      steps,
      deps({
        // Шаг-источник фильтра отдаёт массив: `outputs` описывают его элемент.
        Организации: {
          inputs: [],
          outputs: [{ key: "id", label: "ID", type: "string" }, INN_FIELD],
          outputIsArray: true,
        },
        Письмо: {
          inputs: [{ key: "subject", label: "Тема", type: "string", required: false }],
          outputs: [],
        },
      }),
    );

    expect(result.map((d) => d.key)).toEqual(["s1:filter:orgId", "s2:subject"]);

    const [filterInput, paramInput] = result;
    expect(filterInput).toMatchObject({
      kind: "filter",
      stepIndex: 1,
      stepTitle: "Заказы",
      paramKey: "orgId",
      label: "ИНН организации",
      required: true,
      source: "form",
    });
    expect(paramInput).toMatchObject({
      kind: "param",
      stepIndex: 2,
      label: "Тема",
      required: false,
      source: "form",
    });
  });

  it("does not merge same-named params of different steps", async () => {
    const steps = [
      apiStep("Первый", { mappings: { id: "user" } }),
      apiStep("Второй", { mappings: { id: "user" } }),
    ];

    const result = await enumerateManualInputs(steps, deps());

    expect(result.map((d) => d.key)).toEqual(["s0:id", "s1:id"]);
  });

  it("descends into a nested scenario and prefixes its keys with the step path", async () => {
    const steps = [
      apiStep("Внешний", { mappings: { id: "user" } }),
      { id: "ref", title: "Другой сценарий", type: "scenario", refScenarioId: "inner" } as Step,
    ];

    const result = await enumerateManualInputs(
      steps,
      deps({}, { inner: [apiStep("Вложенный", { mappings: { id: "user" } })] }),
      "outer",
    );

    expect(result.map((d) => d.key)).toEqual(["s0:id", "s1.s0:id"]);
    expect(result[1].stepPath).toEqual([1, 0]);
  });

  it("terminates on a cycle between scenarios", async () => {
    const scenarios: Record<string, Step[]> = {
      a: [{ id: "toB", title: "→B", type: "scenario", refScenarioId: "b" } as Step],
      b: [
        apiStep("Внутри B", { mappings: { id: "user" } }),
        { id: "toA", title: "→A", type: "scenario", refScenarioId: "a" } as Step,
      ],
    };

    const result = await enumerateManualInputs(scenarios.a, deps({}, scenarios), "a");

    expect(result.map((d) => d.key)).toEqual(["s0.s0:id"]);
  });

  it("marks a value bound by a page input block as asked by the page", async () => {
    const page: StepPage = {
      title: "Данные",
      rows: [
        {
          id: "r1",
          items: [
            { id: "b1", type: "input", span: 4, label: "ИНН организации", binding: "inn" },
          ],
        },
      ],
    };

    const steps = [
      apiStep("Организация", {
        mappings: { inn: "user", region: "user" },
        page,
      }),
    ];

    const result = await enumerateManualInputs(
      steps,
      deps({ Организация: { inputs: [INN_FIELD], outputs: [] } }),
    );

    expect(result.find((d) => d.paramKey === "inn")?.source).toBe("page");
    expect(result.find((d) => d.paramKey === "region")?.source).toBe("form");
  });

  it("does not cover a value when the input block has no binding", async () => {
    const page: StepPage = {
      title: "Данные",
      rows: [{ id: "r1", items: [{ id: "b1", type: "input", span: 4, label: "ИНН" }] }],
    };

    const steps = [apiStep("Организация", { mappings: { inn: "user" }, page })];

    const result = await enumerateManualInputs(steps, deps());

    // Без привязки блок ничего не закрывает — значение спросит общая форма.
    expect(result[0].source).toBe("form");
  });

  it("skips a broken step instead of failing the whole enumeration", async () => {
    const steps = [
      apiStep("Сломанный", { mappings: { id: "user" } }),
      apiStep("Живой", { mappings: { subject: "user" } }),
    ];

    const result = await enumerateManualInputs(steps, deps({ Сломанный: null }));

    // Схемы нет — подпись и тип деградируют, но значение всё равно спросим.
    expect(result.map((d) => d.key)).toEqual(["s0:id", "s1:subject"]);
    expect(result[0]).toMatchObject({ label: "id", type: "string", required: false });
  });
});

describe("input scoping", () => {
  it("slices run inputs down to the local keys of one step", () => {
    const inputs = {
      "s0:inn": "7707083893",
      "s1:filter:orgId": "42",
      "s1:subject": "Привет",
      "s2.s0:inn": "вложенный",
    };

    expect(sliceInputsForStep(inputs, [1])).toEqual({
      "filter:orgId": "42",
      subject: "Привет",
    });
    expect(sliceInputsForStep(inputs, [2, 0])).toEqual({ inn: "вложенный" });
  });
});

describe("mapPageDataToLocalKeys", () => {
  it("translates page block ids into the step values they are bound to", () => {
    const step = apiStep("Организация", {
      page: {
        title: "Данные",
        rows: [
          {
            id: "r1",
            items: [
              { id: "инн_организации", type: "input", span: 2, binding: "inn" },
              { id: "статус", type: "select", span: 2, binding: "filter:orgId" },
              { id: "comment", type: "input", span: 4 },
            ],
          },
        ],
      },
    });

    expect(
      mapPageDataToLocalKeys(step, {
        инн_организации: "7707083893",
        статус: "active",
        comment: "как есть",
      }),
    ).toEqual({
      inn: "7707083893",
      "filter:orgId": "active",
      comment: "как есть",
    });
  });
});

describe("missingRequiredKeys", () => {
  it("reports only required form values that have no value", async () => {
    const steps = [
      apiStep("Шаг", {
        mappings: { inn: "user", note: "user" },
      }),
    ];
    const descriptors = await enumerateManualInputs(
      steps,
      deps({
        Шаг: {
          inputs: [INN_FIELD, { key: "note", label: "Заметка", type: "string" }],
          outputs: [],
        },
      }),
    );

    expect(missingRequiredKeys(descriptors, {})).toEqual(["s0:inn"]);
    expect(missingRequiredKeys(descriptors, { "s0:inn": "" })).toEqual(["s0:inn"]);
    expect(missingRequiredKeys(descriptors, { "s0:inn": "7707083893" })).toEqual([]);
  });
});
