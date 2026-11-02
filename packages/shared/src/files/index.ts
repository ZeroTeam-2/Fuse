/** Расширение файла по последней точке — с ведущей точкой, в нижнем регистре. */
export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

/** Форматы файла спецификации, которые принимают и дропзона, и бэкенд. */
export const ALLOWED_SPEC_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);
