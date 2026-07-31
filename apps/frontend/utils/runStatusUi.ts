import type { NotificationType, RunStatus } from "@fuse/shared";

/**
 * Единый словарь отображения статуса запуска: раздел «Запуски», колокольчик и
 * плитки статуса берут подпись/цвета отсюда. Портировано из эталона DS
 * (assets/Fuse Design System/ui_kits/fuse-app/Runs.jsx, RUN_STATUS); статуса
 * `waiting_input` в эталоне нет — он активный, с тоном бренда.
 */
export interface RunStatusUi {
  label: string;
  tone: "neutral" | "brand" | "success";
  /** Классы плитки статуса (фон + цвет иконки). */
  tile: string;
  /** Имя lucide-иконки; у running вместо иконки крутится спиннер. */
  icon: string | null;
}

export const RUN_STATUS_UI: Record<RunStatus, RunStatusUi> = {
  pending: {
    label: "В очереди",
    tone: "neutral",
    tile: "bg-zinc-100 text-zinc-500",
    icon: "clock",
  },
  running: {
    label: "Выполняется",
    tone: "brand",
    tile: "bg-rose-50 text-rose-600",
    icon: null,
  },
  waiting_input: {
    label: "Ждёт ввода",
    tone: "brand",
    tile: "bg-amber-50 text-amber-600",
    icon: "pen-line",
  },
  completed: {
    label: "Завершён",
    tone: "success",
    tile: "bg-green-50 text-green-600",
    icon: "check",
  },
  failed: {
    label: "Ошибка",
    tone: "brand",
    tile: "bg-rose-50 text-rose-600",
    icon: "alert-triangle",
  },
  cancelled: {
    label: "Отменён",
    tone: "neutral",
    tile: "bg-zinc-100 text-zinc-400",
    icon: "x",
  },
};

export const ACTIVE_RUN_STATUSES: RunStatus[] = [
  "pending",
  "running",
  "waiting_input",
] as RunStatus[];

export const TERMINAL_RUN_STATUSES: RunStatus[] = [
  "completed",
  "failed",
  "cancelled",
] as RunStatus[];

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

/** Статус запуска, которым колокольчик рисует плитку уведомления. */
export const NOTIFICATION_RUN_STATUS: Record<NotificationType, RunStatus> = {
  run_completed: "completed" as RunStatus,
  run_failed: "failed" as RunStatus,
  run_cancelled: "cancelled" as RunStatus,
  run_waiting_input: "waiting_input" as RunStatus,
};

export const NOTIFICATION_MESSAGE: Record<NotificationType, string> = {
  run_completed: "запуск завершён",
  run_failed: "завершился с ошибкой",
  run_cancelled: "отменён",
  run_waiting_input: "ждёт вашего ввода",
};

/** «Только что» / «5 мин назад» / «2 ч назад» / дата — для ленты и списка. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "только что";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)} ч назад`;
  if (diffSec < 172_800) return "вчера";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Живой таймер выполняющегося запуска: «2:05» / «1:04:12» (из эталона). */
export function formatElapsed(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
