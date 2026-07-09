import { describe, it, expect } from "vitest";
import type { Step, RunStepResult } from "@fuse/shared";
import {
  resolveMappings,
  resolveTemplate,
  buildTemplateContext,
} from "../src/execution/mapping-resolver";

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
});
