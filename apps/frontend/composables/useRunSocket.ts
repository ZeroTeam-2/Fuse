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
  "input:required",
  "run:done",
  "run:error",
  "progress",
  "run:status",
] as const satisfies readonly ServerWsEvent["type"][];

/**
 * Сторож тишины. События — единственный источник прогресса, и когда поток
 * обрывается, клиент этого НЕ замечает: соединение живо, просто по нему ничего
 * не приходит, а «молчит» и «ещё выполняется» выглядят одинаково. Так и висит
 * вечное «Выполняем сценарий…» — например, если запуск исполнил другой процесс
 * (его события ушли в его же gateway), воркер умер или gateway моргнул.
 *
 * Поэтому: таймер сбрасывается КАЖДЫМ событием, и только после тишины дольше
 * `SILENCE_MS` клиент один раз перечитывает состояние запуска из БД. В обычном
 * запуске (события идут потоком) он не срабатывает ни разу — это страховка, а
 * не второй канал доставки и не поллинг. Если тишина продолжается, интервал
 * удваивается до `MAX_SILENCE_MS`, чтобы длинные шаги (задержка, поллинг
 * стороннего API) не превращались в череду запросов.
 */
const SILENCE_MS = 8_000;
const MAX_SILENCE_MS = 60_000;

interface RunSocketOptions {
  /** Вызывается после тишины: панель перечитывает `GET /api/runs/:id`. */
  onSilence?: () => void;
}

export function useRunSocket(runId: string, options: RunSocketOptions = {}) {
  const apiBase = useApiBase();

  const socket = shallowRef<Socket | null>(null);
  const isConnected = ref(false);
  const events = ref<ServerWsEvent[]>([]);

  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceDelay = SILENCE_MS;

  function armWatchdog() {
    if (!options.onSilence) return;

    clearWatchdog();
    silenceTimer = setTimeout(() => {
      options.onSilence?.();
      silenceDelay = Math.min(silenceDelay * 2, MAX_SILENCE_MS);
      armWatchdog();
    }, silenceDelay);
  }

  function clearWatchdog() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  /** Запуск дошёл до терминального состояния — сторожить больше нечего. */
  function stopWatchdog() {
    options.onSilence = undefined;
    clearWatchdog();
  }

  function noteActivity() {
    silenceDelay = SILENCE_MS;
    armWatchdog();
  }

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
      // Реконнект восстанавливает соединение, но не пропущенные события: их
      // добирает снапшот `run:status`, который gateway шлёт при подключении.
      noteActivity();
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
        noteActivity();
      });
    }

    armWatchdog();
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

  /** Ответ на `input:required`: значения по скоуп-ключам, как их назвал бэкенд. */
  async function submitInputs(stepIndex: number, values: Record<string, unknown>) {
    await fetch(`${apiBase}/api/runs/${runId}/input-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ stepIndex, values }),
    });
  }

  async function cancelRun() {
    await fetch(`${apiBase}/api/runs/${runId}/cancel`, {
      method: "POST",
      credentials: "include",
    });
  }

  function disconnect() {
    clearWatchdog();
    socket.value?.disconnect();
    socket.value = null;
    isConnected.value = false;
  }

  return {
    isConnected,
    events,
    connect,
    disconnect,
    stopWatchdog,
    submitPage,
    submitInputs,
    cancelRun,
  };
}
