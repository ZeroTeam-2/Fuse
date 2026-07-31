// Grouping rule for endpoint blocks, shared by the endpoints browser and the
// collapsible group list so both derive identical block names.

export interface EndpointGroupItem {
  id?: string;
  method: string;
  path: string;
  summary?: string;
  tag?: string;
}

export const OTHER_GROUP = "Прочее";

// Block name: OpenAPI tag when present, else the first path segment when the
// path has a deeper level; single-segment / parameter-led paths → «Прочее».
export function endpointGroupName(ep: EndpointGroupItem): string {
  const tag = ep.tag?.trim();
  if (tag) return tag;
  const segments = ep.path.split("/").filter(Boolean);
  const first = segments[0];
  if (segments.length >= 2 && first && !first.startsWith("{") && !first.startsWith(":")) {
    return first;
  }
  return OTHER_GROUP;
}

// Groups in first-appearance order; «Прочее» always sorts last.
export function groupEndpoints<T extends EndpointGroupItem>(
  endpoints: T[],
): { name: string; endpoints: T[] }[] {
  const map = new Map<string, T[]>();
  for (const ep of endpoints) {
    const name = endpointGroupName(ep);
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(ep);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === OTHER_GROUP ? 1 : 0) - (b[0] === OTHER_GROUP ? 1 : 0))
    .map(([name, eps]) => ({ name, endpoints: eps }));
}

export function endpointMatchesQuery(ep: EndpointGroupItem, q: string): boolean {
  return [ep.path, ep.summary, ep.method, endpointGroupName(ep)].some((t) =>
    String(t ?? "").toLowerCase().includes(q),
  );
}
