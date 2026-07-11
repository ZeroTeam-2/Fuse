import type { RunStatus } from "../enums";

export interface WsEvent<TType extends string, TPayload = unknown> {
  type: TType;
  runId: string;
  payload: TPayload;
  timestamp: string;
}

export interface StepStartPayload {
  stepIndex: number;
  stepTitle: string;
  totalSteps: number;
}

export interface StepDonePayload {
  stepIndex: number;
  stepTitle: string;
  durationMs: number;
  result?: unknown;
}

export interface PageRequiredPayload {
  stepIndex: number;
  stepTitle: string;
  page: unknown;
}

export interface RunDonePayload {
  totalDurationMs: number;
  results: unknown[];
}

export interface RunErrorPayload {
  stepIndex: number;
  stepTitle: string;
  error: string;
  statusCode?: number;
}

export interface ProgressPayload {
  stepIndex: number;
  progress: number;
  message?: string;
}

/**
 * Снапшот состояния запуска. Отправляется при подключении клиента к комнате
 * (в том числе если запуск уже завершился до подключения) и при смене статуса.
 */
export interface RunStatusPayload {
  status: RunStatus;
  currentStep: number;
  stepResults: unknown[];
  error?: string;
}

export type ServerWsEvent =
  | WsEvent<"step:start", StepStartPayload>
  | WsEvent<"step:done", StepDonePayload>
  | WsEvent<"page:required", PageRequiredPayload>
  | WsEvent<"run:done", RunDonePayload>
  | WsEvent<"run:error", RunErrorPayload>
  | WsEvent<"progress", ProgressPayload>
  | WsEvent<"run:status", RunStatusPayload>;

export type ClientWsEvent =
  | WsEvent<"page:submit", { stepIndex: number; data: Record<string, unknown> }>
  | WsEvent<"run:cancel", null>;
