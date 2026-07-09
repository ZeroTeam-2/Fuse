import type { Step, RunStepResult } from "@fuse/shared";

export function resolveTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = context[key];
    if (value === undefined || value === null) {
      return "";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

export function resolveMappings(
  step: Step,
  stepResults: RunStepResult[],
  userInput?: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const mappings = step.mappings ?? {};

  for (const [field, source] of Object.entries(mappings)) {
    if (source === "user") {
      resolved[field] = userInput?.[field] ?? userInput;
      continue;
    }

    if (source === "const") {
      const consts = step.consts ?? {};
      const rawValue = consts[field];

      const templateContext: Record<string, unknown> = {};
      for (let i = 0; i < stepResults.length; i++) {
        const sr = stepResults[i];
        if (sr.result && typeof sr.result === "object") {
          const result = sr.result as Record<string, unknown>;
          for (const [k, v] of Object.entries(result)) {
            templateContext[`s${i}:${k}`] = v;
          }
        }
      }

      if (typeof rawValue === "string") {
        resolved[field] = resolveTemplate(rawValue, templateContext);
      } else {
        resolved[field] = rawValue;
      }
      continue;
    }

    const stepRefMatch = source.match(/^s(\d+):(.+)$/);
    if (stepRefMatch) {
      const idx = Number(stepRefMatch[1]);
      const key = stepRefMatch[2];
      const sr = stepResults[idx];
      if (sr?.result && typeof sr.result === "object") {
        resolved[field] = (sr.result as Record<string, unknown>)[key];
      }
      continue;
    }

    resolved[field] = source;
  }

  return resolved;
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
