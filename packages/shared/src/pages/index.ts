import type {
  PageBlock,
  PageBlockCategory,
  PageBlockType,
  PageRow,
  SchemaField,
  StepPage,
  StepSchema,
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

/** Ключ, под которым значение блока ввода попадает в результат шага-страницы. */
export function blockOutputKey(block: PageBlock): string {
  return block.binding || block.id;
}

/**
 * Отображаемое имя выхода блока — что видит человек в сводке шага и в пикере
 * полей следующего шага: кастомный ключ, если задан, иначе лейбл блока, иначе
 * технический id (последний — только у блока без лейбла и ключа).
 */
export function blockOutputName(block: PageBlock): string {
  return block.binding || block.label || block.id;
}

/** Формат ключа выхода — как у ключей параметров: латиница/цифры/подчёркивание. */
export const OUTPUT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Ключи выходов, встречающиеся у блоков ввода страницы более одного раза.
 * Непустой список — страница невалидна: маппинг `s{idx}:{key}` стал бы
 * неоднозначным. Валидируют и инспектор конструктора, и сервер при сохранении.
 */
export function duplicateOutputKeys(page: StepPage | undefined): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const block of pageBlocks(page).filter(isInputBlock)) {
    const key = blockOutputKey(block);
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return [...dupes];
}

/**
 * Схема шага-страницы для маппинга следующих шагов: выходы — блоки ввода
 * (`dropzone` — файл, остальные — строка), входов в смысле маппинга нет —
 * входной контекст страницы (блоки отображения, `optionsSource`) резолвится
 * напрямую из результатов пройденных шагов.
 */
export function pageStepSchema(page: StepPage | undefined): StepSchema {
  const outputs: SchemaField[] = pageBlocks(page)
    .filter(isInputBlock)
    .map((block) => ({
      key: blockOutputKey(block),
      label: blockOutputName(block),
      type: block.type === "dropzone" ? "file" : "string",
    }));

  return { inputs: [], outputs, outputIsArray: false };
}

/**
 * Проверка файла по настройкам dropzone-блока (`accept`, `maxFileMb`) — до
 * старта загрузки. `accept` принимает расширения (".pdf") и MIME-типы
 * ("application/pdf"). Возвращает текст ошибки либо null.
 */
export function validateFileAgainstBlock(
  block: PageBlock,
  file: { name: string; type: string; size: number },
): string | null {
  const accept = (block.accept ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (accept.length > 0) {
    const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
    const type = (file.type || "").toLowerCase();
    const ok = accept.some((a) => (a.startsWith(".") ? ext === a : type === a));
    if (!ok) return `Недопустимый формат. Допустимые: ${accept.join(", ")}`;
  }
  if (block.maxFileMb && file.size > block.maxFileMb * 1024 * 1024) {
    return `Файл больше ${block.maxFileMb} МБ`;
  }
  return null;
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
