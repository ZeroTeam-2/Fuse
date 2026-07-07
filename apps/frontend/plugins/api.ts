import createClient from "openapi-fetch";
import type { paths } from "../src/types/api";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  const client = createClient<paths>({
    baseUrl: config.public.apiBaseUrl || "http://localhost:3001",
  });

  return {
    provide: {
      api: client,
    },
  };
});
