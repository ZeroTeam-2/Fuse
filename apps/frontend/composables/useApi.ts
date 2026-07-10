import type { Client } from "openapi-fetch";
import type { paths } from "../src/types/api";

export function useApi(): Client<paths> {
  const { $api } = useNuxtApp();
  return $api as unknown as Client<paths>;
}
