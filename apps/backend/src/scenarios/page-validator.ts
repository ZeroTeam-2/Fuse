import type { PageBlockType, StepPage } from "@fuse/shared";
import { PAGE_BLOCK_TYPES } from "@fuse/shared";

const VALID_TYPES = new Set<string>(PAGE_BLOCK_TYPES);

/**
 * Валидация раскладки страницы: непустой заголовок, строки с хотя бы одним
 * блоком, известный тип и ширина 1–4 у каждого блока. Корректность привязок
 * (существование шага-источника/поля) здесь не проверяется: она требует
 * контекста остальных шагов и решается предупреждением на рантайме, а не
 * жёсткой ошибкой сохранения.
 */
export function validatePage(page: unknown): string[] {
  const errors: string[] = [];

  if (!page || typeof page !== "object") {
    return ["page must be an object"];
  }

  const p = page as Record<string, unknown>;

  if (typeof p.title !== "string" || !p.title.trim()) {
    errors.push("page must have a title");
  }

  if (!Array.isArray(p.rows)) {
    errors.push("page must have rows");
    return errors;
  }

  p.rows.forEach((row, ri) => {
    const r = (row ?? {}) as Record<string, unknown>;
    if (!Array.isArray(r.items) || r.items.length === 0) {
      errors.push(`row ${ri} must have at least one block`);
      return;
    }

    r.items.forEach((item, bi) => {
      const b = (item ?? {}) as Record<string, unknown>;
      if (typeof b.type !== "string" || !VALID_TYPES.has(b.type)) {
        errors.push(`row ${ri} block ${bi} has unknown type`);
      }
      if (
        typeof b.span !== "number" ||
        !Number.isInteger(b.span) ||
        b.span < 1 ||
        b.span > 6
      ) {
        errors.push(`row ${ri} block ${bi} span must be 1..6`);
      }
    });
  });

  return errors;
}

export function isValidPage(page: unknown): boolean {
  return validatePage(page).length === 0;
}

/** Пустая страница-заготовка: заголовок без блоков. Строки добавит конструктор. */
export function createDefaultPage(title = ""): StepPage {
  return { title, rows: [] };
}

export type { PageBlockType };
