import type {
  PageBlock,
  PageBlockCategory,
  PageBlockType,
  PageRow,
  StepPage,
} from "../types";

/** Все типы блоков палитры, сгруппированные позже по категории. */
export const PAGE_BLOCK_TYPES: PageBlockType[] = [
  "input",
  "select",
  "dropzone",
  "richtext",
  "paragraph",
];

/** Блоки категории «Отображение» показывают данные, а не собирают их. */
const DISPLAY_BLOCK_TYPES: ReadonlySet<PageBlockType> = new Set(["paragraph"]);

/** Категория блока по его типу. `paragraph` — отображение, остальное — ввод. */
export function blockCategory(type: PageBlockType): PageBlockCategory {
  return DISPLAY_BLOCK_TYPES.has(type) ? "display" : "input";
}

export function isInputBlock(block: PageBlock): boolean {
  return blockCategory(block.type) === "input";
}

export function isDisplayBlock(block: PageBlock): boolean {
  return blockCategory(block.type) === "display";
}

/** Все блоки страницы в порядке строк. */
export function pageBlocks(page: StepPage | undefined): PageBlock[] {
  return (page?.rows ?? []).flatMap((row) => row.items);
}

/** Число размещённых на странице элементов — им конструктор подписывает шаг. */
export function pageBlockCount(page: StepPage | undefined): number {
  return pageBlocks(page).length;
}

/**
 * id для блоков/строк миграции. `crypto.randomUUID` есть и в браузере, и в
 * Node 16+; счётчик — страховка на случай его отсутствия (детерминизм тестам
 * миграции не нужен: они проверяют форму, а не значения id).
 */
let fallbackId = 0;
function genId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${prefix}_${++fallbackId}`;
}

function row(items: PageBlock[]): PageRow {
  return { id: genId("r"), items };
}

/**
 * Конвертер страницы старой модели (union `fields | file | text`) в новую
 * раскладку из блоков. Best-effort, без потери смысла:
 * - `fields` → строки блоков `input` (перенос `target` в `binding`), `hint` —
 *   ведущим `paragraph`; `buttonText` отбрасывается (кнопка — часть рантайма);
 * - `file` → блок `dropzone` (`label = hint`); `accept`/`maxMb` отбрасываются
 *   (рантайм применяет дефолты);
 * - `text` → блок `paragraph`.
 * Уже новую страницу (есть `rows`) возвращает как есть.
 */
export function migrateStepPage(page: unknown): StepPage | undefined {
  if (!page || typeof page !== "object") return undefined;

  const p = page as Record<string, unknown>;

  // Уже новая модель — не трогаем.
  if (Array.isArray(p.rows)) return page as StepPage;

  const title = typeof p.title === "string" ? p.title : "";

  if (p.type === "fields") {
    const rows: PageRow[] = [];
    if (typeof p.hint === "string" && p.hint.trim()) {
      rows.push(row([{ id: genId("b"), type: "paragraph", span: 6, text: p.hint }]));
    }
    const fields = Array.isArray(p.fields) ? p.fields : [];
    for (const raw of fields) {
      const f = (raw ?? {}) as Record<string, unknown>;
      rows.push(
        row([
          {
            id: genId("b"),
            type: "input",
            span: 6,
            label: typeof f.label === "string" ? f.label : "",
            placeholder: typeof f.placeholder === "string" ? f.placeholder : "",
            ...(typeof f.target === "string" && f.target
              ? { binding: f.target }
              : {}),
          },
        ]),
      );
    }
    return { title, rows };
  }

  if (p.type === "file") {
    return {
      title,
      rows: [
        row([
          {
            id: genId("b"),
            type: "dropzone",
            span: 6,
            label: typeof p.hint === "string" ? p.hint : "Загрузка файла",
          },
        ]),
      ],
    };
  }

  if (p.type === "text") {
    return {
      title,
      rows: [
        row([
          {
            id: genId("b"),
            type: "paragraph",
            span: 6,
            text: typeof p.body === "string" ? p.body : "",
          },
        ]),
      ],
    };
  }

  return undefined;
}
