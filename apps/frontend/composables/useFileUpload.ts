import type { UploadedFileRef } from "@fuse/shared";

/**
 * Загрузка файла dropzone-блока в хранилище платформы ДО сабмита страницы.
 * Режим выбирается по размеру: ≤ порога — один multipart-запрос
 * `/api/uploads/single`, больше — чанковая сессия `/api/uploads/chunked/*`
 * (init → part → complete) с паузой/возобновлением и продолжением после
 * обрыва: сессия и загруженные части живут на сервере, докачка идёт с первой
 * недостающей части.
 */
export type FileUploadStatus =
  | "idle"
  | "uploading"
  | "paused"
  | "interrupted"
  | "done"
  | "cancelled"
  | "error";

export interface FileUploadState {
  status: FileUploadStatus;
  /** Чанковый режим: доступны пауза и возобновление. */
  chunked: boolean;
  fileName: string;
  uploadedBytes: number;
  totalBytes: number;
  /** 0–100, по байтам. */
  percent: number;
  /** Человекочитаемая ошибка/причина остановки. */
  message: string;
  /** Ссылка на объект хранилища — значение блока для `page:submit`. */
  result: UploadedFileRef | null;
}

export interface FileUploadHandle {
  state: FileUploadState;
  pause: () => void;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Повтор single-загрузки после ошибки. */
  retry: () => Promise<void>;
}

interface UploaderConfig {
  apiBase: string;
  singleMaxBytes: number;
  partSizeBytes: number;
}

/** XHR вместо fetch ради `upload.onprogress` — байтового прогресса исходящего тела. */
function xhrSend(
  url: string,
  body: XMLHttpRequestBodyInit,
  contentType: string | null,
  onProgress: (loadedBytes: number) => void,
): { promise: Promise<unknown>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<unknown>((resolve, reject) => {
    xhr.open("POST", url);
    xhr.withCredentials = true;
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch {
          resolve(null);
        }
      } else {
        let message = `${xhr.status} ${xhr.statusText}`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { message?: string | string[] };
          if (parsed.message) {
            message = Array.isArray(parsed.message) ? parsed.message.join("; ") : parsed.message;
          }
        } catch {
          /* тело не JSON — оставляем статус */
        }
        reject(new UploadHttpError(message));
      }
    };
    // Сетевая ошибка/обрыв — отличаем от HTTP-ошибки: чанки на сервере целы.
    xhr.onerror = () => reject(new UploadNetworkError());
    xhr.onabort = () => reject(new UploadAbortedError());
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

class UploadHttpError extends Error {}
class UploadNetworkError extends Error {}
class UploadAbortedError extends Error {}

function toRef(file: File, objectName: string): UploadedFileRef {
  return {
    objectName,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "application/octet-stream",
  };
}

function createUpload(cfg: UploaderConfig, file: File): FileUploadHandle {
  const state = reactive<FileUploadState>({
    status: "idle",
    chunked: file.size > cfg.singleMaxBytes,
    fileName: file.name,
    uploadedBytes: 0,
    totalBytes: file.size,
    percent: 0,
    message: "",
    result: null,
  });

  const contentType = file.type || "application/octet-stream";
  const totalParts = Math.max(1, Math.ceil(file.size / cfg.partSizeBytes));

  let uploadId: string | null = null;
  let abortCurrent: (() => void) | null = null;
  let pauseRequested = false;

  function setProgress(uploadedBytes: number) {
    state.uploadedBytes = Math.min(uploadedBytes, file.size);
    state.percent = file.size > 0 ? Math.round((state.uploadedBytes / file.size) * 100) : 100;
  }

  async function api(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(`${cfg.apiBase}${path}`, {
      credentials: "include",
      ...init,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new UploadHttpError(body?.message ?? `${response.status} ${response.statusText}`);
    }
    return response.json().catch(() => null);
  }

  async function runSingle(): Promise<void> {
    state.status = "uploading";
    state.message = "";
    const form = new FormData();
    form.append("file", file, file.name);
    const { promise, abort } = xhrSend(
      `${cfg.apiBase}/api/uploads/single`,
      form,
      null,
      setProgress,
    );
    abortCurrent = abort;
    try {
      const result = (await promise) as { objectName: string };
      setProgress(file.size);
      state.result = toRef(file, result.objectName);
      state.status = "done";
    } catch (err) {
      if (err instanceof UploadAbortedError) {
        state.status = "cancelled";
      } else if (err instanceof UploadNetworkError) {
        // Single не возобновляется — только повтор с нуля.
        state.status = "error";
        state.message = "Соединение прервалось — попробуйте ещё раз";
      } else {
        state.status = "error";
        state.message = err instanceof Error ? err.message : String(err);
      }
    } finally {
      abortCurrent = null;
    }
  }

  /** Части, уже лежащие на сервере (после обрыва/паузы «пережившей» страницу). */
  async function fetchDoneParts(): Promise<Set<number>> {
    const status = (await api(`/api/uploads/chunked/${uploadId}`, { method: "GET" })) as {
      uploadedParts: { partNumber: number; size: number }[];
    };
    return new Set(status.uploadedParts.map((p) => p.partNumber));
  }

  async function runChunked(doneParts: Set<number>): Promise<void> {
    state.status = "uploading";
    state.message = "";
    try {
      if (!uploadId) {
        const init = (await api("/api/uploads/chunked/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileSize: file.size, contentType }),
        })) as { uploadId: string };
        uploadId = init.uploadId;
      }

      let completedBytes = 0;
      for (const part of doneParts) {
        const start = (part - 1) * cfg.partSizeBytes;
        completedBytes += Math.min(cfg.partSizeBytes, file.size - start);
      }
      setProgress(completedBytes);

      for (let part = 1; part <= totalParts; part++) {
        if (doneParts.has(part)) continue;
        if (pauseRequested) {
          pauseRequested = false;
          state.status = "paused";
          return;
        }

        const start = (part - 1) * cfg.partSizeBytes;
        const chunk = file.slice(start, Math.min(start + cfg.partSizeBytes, file.size));
        const { promise, abort } = xhrSend(
          `${cfg.apiBase}/api/uploads/chunked/${uploadId}/part/${part}`,
          chunk,
          "application/octet-stream",
          (loaded) => setProgress(completedBytes + loaded),
        );
        abortCurrent = abort;
        await promise;
        abortCurrent = null;
        completedBytes += chunk.size;
        setProgress(completedBytes);
      }

      const completed = (await api(`/api/uploads/chunked/${uploadId}/complete`, {
        method: "POST",
      })) as { objectName: string };
      state.result = toRef(file, completed.objectName);
      state.status = "done";
    } catch (err) {
      abortCurrent = null;
      if (err instanceof UploadAbortedError) {
        state.status = "cancelled";
      } else if (err instanceof UploadNetworkError || err instanceof TypeError) {
        state.status = "interrupted";
        state.message = `Соединение прервалось на ${state.percent}% — загруженные чанки сохранены`;
      } else {
        state.status = "error";
        state.message = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const isChunked = file.size > cfg.singleMaxBytes;

  function pause() {
    // Пауза — «не слать следующий чанк»: текущая часть докачивается.
    if (isChunked && state.status === "uploading") pauseRequested = true;
  }

  async function resume() {
    if (!isChunked || state.status === "uploading" || state.status === "done") return;
    // После обрыва сервер знает больше нас — сверяемся с фактом.
    const doneParts = uploadId ? await fetchDoneParts().catch(() => new Set<number>()) : new Set<number>();
    await runChunked(doneParts);
  }

  async function cancel() {
    pauseRequested = false;
    abortCurrent?.();
    if (isChunked && uploadId) {
      await api(`/api/uploads/chunked/${uploadId}/abort`, { method: "POST" }).catch(() => undefined);
      uploadId = null;
    }
    state.status = "cancelled";
    state.result = null;
    setProgress(0);
  }

  async function retry() {
    if (state.status !== "error") return;
    setProgress(0);
    if (isChunked) {
      await runChunked(new Set());
    } else {
      await runSingle();
    }
  }

  if (isChunked) {
    void runChunked(new Set());
  } else {
    void runSingle();
  }

  return { state, pause, resume, cancel, retry };
}

export function useFileUpload() {
  const apiBase = useApiBase();
  const config = useRuntimeConfig();
  const singleMaxBytes = Number(config.public.fileSingleUploadMaxMb) * 1024 * 1024;
  const partSizeBytes = Number(config.public.uploadPartSizeMb) * 1024 * 1024;

  return {
    singleMaxBytes,
    /** Стартует загрузку сразу; за ходом следит `handle.state`. */
    upload(file: File): FileUploadHandle {
      return createUpload({ apiBase, singleMaxBytes, partSizeBytes }, file);
    },
  };
}
