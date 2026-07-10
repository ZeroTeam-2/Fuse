import createClient from "openapi-fetch";
import type { paths } from "../src/types/api";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  const client = createClient<paths>({
    baseUrl: config.public.apiBaseUrl || "http://localhost:3001",
    credentials: "include",
  });

  if (import.meta.server) {
    const headers = useRequestHeaders(["cookie"]);
    client.use({
      onRequest({ request }) {
        if (headers.cookie) {
          request.headers.set("cookie", headers.cookie);
        }
        return request;
      },
    });
  }

  return {
    provide: {
      api: client,
    },
  };
});
