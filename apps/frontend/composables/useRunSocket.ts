import type { ServerWsEvent, ClientWsEvent } from "@fuse/shared";

export function useRunSocket(runId: string) {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBaseUrl || "http://localhost:3001";
  const wsUrl = baseUrl.replace(/^http/, "ws");

  const socket = ref<WebSocket | null>(null);
  const isConnected = ref(false);
  const events = ref<ServerWsEvent[]>([]);

  function connect() {
    const ws = new WebSocket(`${wsUrl}/runs?runId=${runId}`);
    socket.value = ws;

    ws.onopen = () => {
      isConnected.value = true;
    };

    ws.onclose = () => {
      isConnected.value = false;
    };

    ws.onerror = () => {
      isConnected.value = false;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ServerWsEvent;
        events.value.push(data);
      } catch {
        // ignore malformed messages
      }
    };
  }

  function send(event: ClientWsEvent) {
    if (socket.value?.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify(event));
    }
  }

  function submitPage(stepIndex: number, data: Record<string, unknown>) {
    send({
      type: "page:submit",
      runId,
      payload: { stepIndex, data },
      timestamp: new Date().toISOString(),
    });
  }

  function cancelRun() {
    send({
      type: "run:cancel",
      runId,
      payload: null,
      timestamp: new Date().toISOString(),
    });
  }

  function disconnect() {
    socket.value?.close();
    socket.value = null;
    isConnected.value = false;
  }

  return {
    isConnected,
    events,
    connect,
    disconnect,
    send,
    submitPage,
    cancelRun,
  };
}
