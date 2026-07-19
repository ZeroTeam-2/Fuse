import { describe, it, expect } from "vitest";
import {
  artifactExt,
  artifactFileName,
  baseMime,
  fileNameFromDisposition,
  isFileResponse,
} from "../src/execution/response-artifacts";

describe("isFileResponse — детект файлового ответа API", () => {
  it("считает файлом бинарные MIME", () => {
    expect(isFileResponse("application/pdf", null)).toBe(true);
    expect(isFileResponse("application/zip", null)).toBe(true);
    expect(isFileResponse("image/png", null)).toBe(true);
    expect(isFileResponse("application/octet-stream; charset=binary", null)).toBe(true);
  });

  it("не трогает JSON и текст — они остаются в Mongo как раньше", () => {
    expect(isFileResponse("application/json", null)).toBe(false);
    expect(isFileResponse("application/json; charset=utf-8", null)).toBe(false);
    expect(isFileResponse("application/problem+json", null)).toBe(false);
    expect(isFileResponse("text/plain", null)).toBe(false);
    expect(isFileResponse("text/csv", null)).toBe(false);
    expect(isFileResponse("application/xml", null)).toBe(false);
    expect(isFileResponse(null, null)).toBe(false);
    expect(isFileResponse("", null)).toBe(false);
  });

  it("явный attachment — файл независимо от MIME", () => {
    expect(isFileResponse("text/csv", 'attachment; filename="report.csv"')).toBe(true);
  });
});

describe("fileNameFromDisposition", () => {
  it("берёт filename из заголовка", () => {
    expect(fileNameFromDisposition('attachment; filename="report.pdf"')).toBe("report.pdf");
    expect(fileNameFromDisposition("attachment; filename=data.zip")).toBe("data.zip");
  });

  it("filename* с RFC 5987-кодировкой приоритетнее", () => {
    expect(
      fileNameFromDisposition(
        "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82.pdf",
      ),
    ).toBe("отчёт.pdf");
  });

  it("без заголовка — null", () => {
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition("inline")).toBeNull();
  });
});

describe("artifactFileName / artifactExt", () => {
  it("генерирует имя из названия шага и MIME, когда заголовка нет", () => {
    expect(artifactFileName(null, "application/pdf", "Выгрузка отчёта")).toBe(
      "Выгрузка отчёта.pdf",
    );
  });

  it("экранирует недопустимые символы в названии шага", () => {
    expect(artifactFileName(null, "application/zip", "Шаг: выгрузка/архив")).toBe(
      "Шаг_ выгрузка_архив.zip",
    );
  });

  it("неизвестный MIME падает в .bin", () => {
    expect(artifactExt("noext", "application/x-strange")).toBe(".bin");
  });

  it("расширение берётся из имени файла, если оно есть", () => {
    expect(artifactExt("report.tar.gz", "application/octet-stream")).toBe(".gz");
  });

  it("baseMime отрезает параметры и регистр", () => {
    expect(baseMime("Application/PDF; charset=binary")).toBe("application/pdf");
  });
});
