// Чистые функции разбора файлового ответа внешнего API: детект по заголовкам,
// имя файла из Content-Disposition, расширение по MIME. Без DI — тестируются
// напрямую, воркер лишь склеивает их с MinIO и Mongo.

/** MIME → расширение для имён артефактов; неизвестные типы идут в `.bin`. */
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/gzip": ".gz",
  "application/x-tar": ".tar",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/msword": ".doc",
  "application/octet-stream": ".bin",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "video/mp4": ".mp4",
};

/** `content-type` без параметров (`; charset=...`), в нижнем регистре. */
export function baseMime(contentType: string | null): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/**
 * Файловый ли ответ: всё, что не JSON и не текст, либо явный attachment.
 * JSON/текст остаются в Mongo как раньше — файлом считается только то,
 * что через `response.text()` было бы испорчено.
 */
export function isFileResponse(
  contentType: string | null,
  contentDisposition: string | null,
): boolean {
  if ((contentDisposition ?? "").toLowerCase().includes("attachment")) {
    return true;
  }
  const mime = baseMime(contentType);
  if (!mime) return false;
  if (mime.startsWith("text/")) return false;
  if (mime === "application/json" || mime.endsWith("+json")) return false;
  if (mime === "application/xml" || mime.endsWith("+xml")) return false;
  return true;
}

/** `filename*=UTF-8''...` приоритетнее `filename="..."` (RFC 6266). */
export function fileNameFromDisposition(
  contentDisposition: string | null,
): string | null {
  if (!contentDisposition) return null;

  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(
    contentDisposition,
  );
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // Битая кодировка — падаем на обычный filename ниже.
    }
  }

  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(contentDisposition);
  return plain ? plain[1].trim() : null;
}

export function extForMime(contentType: string | null): string {
  return EXT_BY_MIME[baseMime(contentType)] ?? ".bin";
}

/**
 * Имя артефакта для показа пользователю: из Content-Disposition, иначе
 * генерируется из названия шага и MIME-расширения.
 */
export function artifactFileName(
  contentDisposition: string | null,
  contentType: string | null,
  stepTitle: string,
): string {
  const fromHeader = fileNameFromDisposition(contentDisposition);
  if (fromHeader) return fromHeader;
  const base = stepTitle.trim().replace(/[\\/:*?"<>|]+/g, "_") || "result";
  return `${base}${extForMime(contentType)}`;
}

/** Расширение для ключа S3: из имени файла, иначе по MIME. */
export function artifactExt(
  fileName: string,
  contentType: string | null,
): string {
  const dot = fileName.lastIndexOf(".");
  if (dot > 0 && dot < fileName.length - 1) {
    return fileName.slice(dot);
  }
  return extForMime(contentType);
}
