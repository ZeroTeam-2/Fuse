import { describe, it, expect } from "vitest";
import type { Step, RunStepResult, StepFilter } from "@fuse/shared";
import {
  resolveMappings,
  resolveTemplate,
  buildTemplateContext,
  filterInputKey,
  groupInputsByLocation,
} from "../src/execution/mapping-resolver";
import { StepExecutionError } from "../src/execution/execution-errors";

describe("MappingResolver", () => {
  describe("resolveMappings — user mappings", () => {
    it("resolves 'user' mapping from userInput field", () => {
      const step = {
        id: "s1",
        title: "Test",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { apiKey: "user" },
      } as Step;

      const result = resolveMappings(step, [], { apiKey: "secret-key" });
      expect(result.apiKey).toBe("secret-key");
    });

    it("falls back to entire userInput when field is absent", () => {
      const step = {
        id: "s1",
        title: "Test",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { token: "user" },
      } as Step;

      const result = resolveMappings(step, [], { foo: "bar" });
      expect(result.token).toEqual({ foo: "bar" });
    });
  });

  describe("resolveMappings — const mappings", () => {
    it("resolves 'const' mapping from step.consts", () => {
      const step = {
        id: "s1",
        title: "Test",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { contentType: "const" },
        consts: { contentType: "application/json" },
      } as Step;

      const result = resolveMappings(step, []);
      expect(result.contentType).toBe("application/json");
    });

    it("returns undefined for const mapping without a value", () => {
      const step = {
        id: "s1",
        title: "Test",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { missing: "const" },
        consts: {},
      } as Step;

      const result = resolveMappings(step, []);
      expect(result.missing).toBeUndefined();
    });
  });

  describe("resolveMappings — upstream s{index}:key mappings", () => {
    it("resolves s0:key from first step result", () => {
      const stepResults: RunStepResult[] = [
        {
          stepIndex: 0,
          stepTitle: "Auth",
          status: "completed",
          result: { token: "abc-xyz", userId: 42 },
        },
      ];

      const step = {
        id: "s2",
        title: "Fetch",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/users/{id}",
        mappings: { userId: "s0:userId", authToken: "s0:token" },
      } as Step;

      const result = resolveMappings(step, stepResults);
      expect(result.userId).toBe(42);
      expect(result.authToken).toBe("abc-xyz");
    });

    it("resolves s1:key from second step result", () => {
      const stepResults: RunStepResult[] = [
        { stepIndex: 0, stepTitle: "A", status: "completed", result: { a: 1 } },
        { stepIndex: 1, stepTitle: "B", status: "completed", result: { b: 2 } },
      ];

      const step = {
        id: "s3",
        title: "C",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { val: "s1:b" },
      } as Step;

      const result = resolveMappings(step, stepResults);
      expect(result.val).toBe(2);
    });
  });

  describe("missing upstream key", () => {
    it("returns undefined when upstream key does not exist in result", () => {
      const stepResults: RunStepResult[] = [
        { stepIndex: 0, stepTitle: "A", status: "completed", result: { a: 1 } },
      ];

      const step = {
        id: "s2",
        title: "B",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { val: "s0:nonexistent" },
      } as Step;

      const result = resolveMappings(step, stepResults);
      expect(result.val).toBeUndefined();
    });

    it("returns undefined when upstream step index is out of range", () => {
      const step = {
        id: "s1",
        title: "B",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { val: "s5:key" },
      } as Step;

      const result = resolveMappings(step, []);
      expect(result.val).toBeUndefined();
    });

    it("returns undefined when upstream result is null", () => {
      const stepResults: RunStepResult[] = [
        { stepIndex: 0, stepTitle: "A", status: "completed", result: null },
      ];

      const step = {
        id: "s2",
        title: "B",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/test",
        mappings: { val: "s0:foo" },
      } as Step;

      const result = resolveMappings(step, stepResults);
      expect(result.val).toBeUndefined();
    });
  });

  describe("resolveTemplate — {{token}} substitution", () => {
    it("substitutes access_token from upstream context", () => {
      const result = resolveTemplate("Bearer {{access_token}}", {
        access_token: "tok-abc",
      });
      expect(result).toBe("Bearer tok-abc");
    });

    it("substitutes multiple tokens in one string", () => {
      const result = resolveTemplate("{{a}}-{{b}}-{{c}}", {
        a: "x",
        b: "y",
        c: "z",
      });
      expect(result).toBe("x-y-z");
    });

    it("replaces missing token with empty string", () => {
      const result = resolveTemplate("Bearer {{missing}}", {});
      expect(result).toBe("Bearer ");
    });

    it("stringifies object values as JSON", () => {
      const result = resolveTemplate("{{data}}", { data: { x: 1 } });
      expect(result).toBe('{"x":1}');
    });

    it("handles null values as empty string", () => {
      const result = resolveTemplate("val={{v}}", { v: null });
      expect(result).toBe("val=");
    });

    it("returns original text when no tokens present", () => {
      const result = resolveTemplate("plain text", {});
      expect(result).toBe("plain text");
    });
  });

  describe("buildTemplateContext", () => {
    it("builds s{index}:key context from step results", () => {
      const stepResults: RunStepResult[] = [
        {
          stepIndex: 0,
          stepTitle: "Auth",
          status: "completed",
          result: { access_token: "tok", user_id: 7 },
        },
        {
          stepIndex: 1,
          stepTitle: "Profile",
          status: "completed",
          result: { name: "Иван" },
        },
      ];

      const ctx = buildTemplateContext(stepResults);
      expect(ctx["s0:access_token"]).toBe("tok");
      expect(ctx["s0:user_id"]).toBe(7);
      expect(ctx["s1:name"]).toBe("Иван");
    });

    it("skips step results with null or non-object results", () => {
      const stepResults: RunStepResult[] = [
        { stepIndex: 0, stepTitle: "A", status: "completed", result: null },
        { stepIndex: 1, stepTitle: "B", status: "completed", result: "string" },
      ];

      const ctx = buildTemplateContext(stepResults);
      expect(Object.keys(ctx)).toHaveLength(0);
    });
  });

  describe("groupInputsByLocation", () => {
    const INPUTS = [
      { key: "guid", label: "guid", type: "string" as const, loc: "path" as const },
      { key: "limit", label: "limit", type: "number" as const, loc: "query" as const },
      { key: "Authorization", label: "Authorization", type: "string" as const, loc: "header" as const },
      { key: "name", label: "name", type: "string" as const, loc: "body" as const },
    ];

    it("splits resolved inputs by their place in the request", () => {
      const located = groupInputsByLocation(
        { guid: "u-1", limit: 10, Authorization: "Bearer t", name: "ООО Ромашка" },
        INPUTS,
        "/collections/{guid}",
      );

      expect(located.path).toEqual({ guid: "u-1" });
      expect(located.query).toEqual({ limit: 10 });
      expect(located.header).toEqual({ Authorization: "Bearer t" });
      expect(located.body).toEqual({ name: "ООО Ромашка" });
    });

    it("treats a path placeholder as authoritative over a stale schema", () => {
      const located = groupInputsByLocation(
        { guid: "u-1" },
        [{ key: "guid", label: "guid", type: "string", loc: "body" }],
        "/collections/{guid}",
      );

      expect(located.path).toEqual({ guid: "u-1" });
      expect(located.body).toEqual({});
    });

    it("falls back to body for fields missing from the schema", () => {
      const located = groupInputsByLocation({ extra: 1 }, [], "/collections");

      expect(located.body).toEqual({ extra: 1 });
      expect(located.path).toEqual({});
    });
  });

  describe("resolveMappings — array outputs", () => {
    const ORGS = [
      { id: "org-1", inn: "7707083893", amount: 900, active: false },
      { id: "org-2", inn: "5024002119", amount: 1200, active: true },
      { id: "org-3", inn: "5024002119", amount: 1500, active: true },
    ];

    function collectionResult(result: unknown): RunStepResult[] {
      return [{ stepIndex: 0, stepTitle: "Список организаций", status: "completed", result }];
    }

    function stepWithFilter(filter?: StepFilter): Step {
      return {
        id: "s2",
        title: "Карточка организации",
        type: "api",
        appId: "a1",
        endpointId: "e1",
        method: "GET",
        path: "/orgs/{orgId}",
        mappings: { orgId: "s0:id" },
        ...(filter ? { filters: { orgId: filter } } : {}),
      } as Step;
    }

    it("picks the element matching the condition", () => {
      const step = stepWithFilter({
        field: "inn",
        op: "eq",
        value: { mode: "const", const: "7707083893" },
      });

      const result = resolveMappings(step, collectionResult(ORGS));
      expect(result.orgId).toBe("org-1");
    });

    it("compares numbers numerically, not as strings", () => {
      // Строковое сравнение выбрало бы "900" > "1000" — тут это ловится.
      const step = stepWithFilter({
        field: "amount",
        op: "gt",
        value: { mode: "const", const: "1000" },
      });

      const warnings: string[] = [];
      const result = resolveMappings(step, collectionResult(ORGS), undefined, warnings);

      expect(result.orgId).toBe("org-2");
      expect(warnings).toHaveLength(1); // org-2 и org-3 оба > 1000
    });

    it("supports every operator", () => {
      const cases: { op: StepFilter["op"]; field: string; value: string; expected: string }[] = [
        { op: "eq", field: "id", value: "org-2", expected: "org-2" },
        { op: "ne", field: "inn", value: "7707083893", expected: "org-2" },
        { op: "gt", field: "amount", value: "1200", expected: "org-3" },
        { op: "lt", field: "amount", value: "1000", expected: "org-1" },
        { op: "gte", field: "amount", value: "1200", expected: "org-2" },
        { op: "lte", field: "amount", value: "900", expected: "org-1" },
        { op: "contains", field: "inn", value: "770708", expected: "org-1" },
      ];

      for (const c of cases) {
        const step = stepWithFilter({
          field: c.field,
          op: c.op,
          value: { mode: "const", const: c.value },
        });
        const result = resolveMappings(step, collectionResult(ORGS));
        expect(result.orgId, `operator ${c.op}`).toBe(c.expected);
      }
    });

    it("matches booleans", () => {
      const step = stepWithFilter({
        field: "active",
        op: "eq",
        value: { mode: "const", const: "false" },
      });

      expect(resolveMappings(step, collectionResult(ORGS)).orgId).toBe("org-1");
    });

    it("fails the step when the condition matches nothing", () => {
      const step = stepWithFilter({
        field: "inn",
        op: "eq",
        value: { mode: "const", const: "0000000000" },
      });

      expect(() => resolveMappings(step, collectionResult(ORGS))).toThrow(StepExecutionError);
      expect(() => resolveMappings(step, collectionResult(ORGS))).toThrow(/не отобрало ни одного/);
    });

    it("takes the first of several matches and warns", () => {
      const step = stepWithFilter({
        field: "inn",
        op: "eq",
        value: { mode: "const", const: "5024002119" },
      });

      const warnings: string[] = [];
      const result = resolveMappings(step, collectionResult(ORGS), undefined, warnings);

      expect(result.orgId).toBe("org-2");
      expect(warnings[0]).toContain("взят первый");
    });

    it("takes the first element when an array has no filter at all", () => {
      const result = resolveMappings(stepWithFilter(), collectionResult(ORGS));
      expect(result.orgId).toBe("org-1");
    });

    it("filters an array field nested in an object result", () => {
      const step = stepWithFilter({
        arrayPath: "items",
        field: "inn",
        op: "eq",
        value: { mode: "const", const: "7707083893" },
      });

      const result = resolveMappings(step, collectionResult({ total: 3, items: ORGS }));
      expect(result.orgId).toBe("org-1");
    });

    it("warns instead of failing when arrayPath no longer points at an array", () => {
      const step = stepWithFilter({
        arrayPath: "items",
        field: "inn",
        op: "eq",
        value: { mode: "const", const: "7707083893" },
      });

      const warnings: string[] = [];
      const result = resolveMappings(
        step,
        collectionResult({ id: "org-9", items: "gone" }),
        undefined,
        warnings,
      );

      expect(result.orgId).toBe("org-9");
      expect(warnings[0]).toContain("не является массивом");
    });

    it("takes the condition operand from another step", () => {
      const step = stepWithFilter({
        field: "inn",
        op: "eq",
        value: { mode: "ref", ref: "s1:inn" },
      });

      const stepResults: RunStepResult[] = [
        ...collectionResult(ORGS),
        { stepIndex: 1, stepTitle: "Реквизиты", status: "completed", result: { inn: "5024002119" } },
      ];

      const warnings: string[] = [];
      expect(resolveMappings(step, stepResults, undefined, warnings).orgId).toBe("org-2");
    });

    it("takes the condition operand from user input", () => {
      const step = stepWithFilter({
        field: "inn",
        op: "eq",
        value: { mode: "user" },
      });

      const result = resolveMappings(step, collectionResult(ORGS), {
        [filterInputKey("orgId")]: "7707083893",
      });

      expect(result.orgId).toBe("org-1");
    });

    it("puts the filtered value where the request actually needs it", () => {
      // Регрессия: раньше сборка запроса ждала `resolved.path`, а резолвер отдавал
      // плоскую карту — path-параметр не подставлялся, и в URL уезжал `{orgId}`.
      const step = stepWithFilter({
        field: "inn",
        op: "eq",
        value: { mode: "const", const: "7707083893" },
      });

      const resolved = resolveMappings(step, collectionResult(ORGS));
      const located = groupInputsByLocation(
        resolved,
        [{ key: "orgId", label: "orgId", type: "string", loc: "path" }],
        "/orgs/{orgId}",
      );

      expect(located.path).toEqual({ orgId: "org-1" });
      expect(located.query).toEqual({});
      expect(located.body).toEqual({});
    });

    it("resolves a {{s0:key}} template in the condition operand", () => {
      const step = stepWithFilter({
        field: "inn",
        op: "eq",
        value: { mode: "const", const: "{{s1:inn}}" },
      });

      const stepResults: RunStepResult[] = [
        ...collectionResult(ORGS),
        { stepIndex: 1, stepTitle: "Реквизиты", status: "completed", result: { inn: "7707083893" } },
      ];

      expect(resolveMappings(step, stepResults).orgId).toBe("org-1");
    });
  });
});
