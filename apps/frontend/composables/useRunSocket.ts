import { io, type Socket } from "socket.io-client";
import type { ServerWsEvent } from "@fuse/shared";

/**
 * Бэкенд поднимает socket.io-gateway с namespace "runs" (см. run.gateway.ts) и
 * шлёт каждое событие под именем event.type, а телом — сам ServerWsEvent.
 * Подписываемся ровно на эти имена.
 */
const SERVER_EVENTS = [
  "step:start",
  "step:done",
  "page:required",
  "run:done",
  "run:error",
  "progress",
  "run:status",
] as const satisfies readonly ServerWsEvent["type"][];

export function useRunSocket(runId: string) {
  const apiBase = useApiBase();

  const socket = shallowRef<Socket | null>(null);
  const isConnected = ref(false);
  const events = ref<ServerWsEvent[]>([]);

  function connect() {
    // apiBase пуст в проде (фронт и бэк за одним caddy) — тогда "/runs"
    // socket.io понимает как namespace на текущем origin. В дев-режиме base
    // абсолютный ("http://localhost:3001"), namespace дописывается к нему.
    const client = io(`${apiBase}/runs`, {
      query: { runId },
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socket.value = client;

    client.on("connect", () => {
      isConnected.value = true;
    });

    client.on("disconnect", () => {
      isConnected.value = false;
    });

    client.on("connect_error", () => {
      isConnected.value = false;
    });

    for (const type of SERVER_EVENTS) {
      client.on(type, (event: ServerWsEvent) => {
        events.value.push(event);
      });
    }
  }

  /**
   * Команды в сторону сервера идут по HTTP, а не в сокет: gateway не объявляет
   * ни одного @SubscribeMessage, зато у ExecutionController есть готовые
   * эндпоинты с авторизацией и валидацией.
   */
  async function submitPage(stepIndex: number, data: Record<string, unknown>) {
    await fetch(`${apiBase}/api/runs/${runId}/page-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ stepIndex, data }),
    });
  }

  async function cancelRun() {
    await fetch(`${apiBase}/api/runs/${runId}/cancel`, {
      method: "POST",
      credentials: "include",
    });
  }

  function disconnect() {
    socket.value?.disconnect();
    socket.value = null;
    isConnected.value = false;
  }

  return {
    isConnected,
    events,
    connect,
    disconnect,
    submitPage,
    cancelRun,
  };
}
