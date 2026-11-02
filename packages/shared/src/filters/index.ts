import type { FilterOperator } from "../types";

/**
 * Подписи операторов отбора — одни и те же в сводке шага на фронтенде и в
 * сообщениях об ошибке отбора на бэкенде. Тип `Record<FilterOperator, …>`
 * держит набор полным: новый оператор ломает компиляцию, а не теряет подпись.
 */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  contains: "содержит",
};
