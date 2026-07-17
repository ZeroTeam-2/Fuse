import { describe, it, expect } from "vitest";
import { OpenApiParserService } from "../src/apps/openapi-parser";

const SPEC_URL = "https://api.example.com/openapi.json";

function specWith(responseSchema: Record<string, unknown>) {
  return {
    openapi: "3.0.0",
    info: { title: "Demo", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
    paths: {
      "/orgs": {
        get: {
          summary: "List organizations",
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: responseSchema } } },
          },
        },
      },
    },
  } as Record<string, unknown>;
}

const ORG_ITEM = {
  type: "object",
  properties: {
    id: { type: "string", example: "42" },
    inn: { type: "string" },
    amount: { type: "integer" },
  },
};

describe("OpenAPI parser: multipart file inputs", () => {
  it("maps `type: string, format: binary` body fields to the file type", async () => {
    const parser = new OpenApiParserService();

    const parsed = await parser.parse(
      {
        openapi: "3.0.0",
        info: { title: "Demo", version: "1.0.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/pdf/process": {
            post: {
              summary: "Process a document",
              requestBody: {
                content: {
                  "multipart/form-data": {
                    schema: {
                      type: "object",
                      required: ["doc", "data"],
                      properties: {
                        doc: { type: "string", format: "binary" },
                        data: { type: "string" },
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      } as Record<string, unknown>,
      SPEC_URL,
    );

    const inputs = parsed.endpoints[0].inputs;
    expect(inputs.find((f) => f.key === "doc")?.type).toBe("file");
    expect(inputs.find((f) => f.key === "data")?.type).toBe("string");
  });
});

describe("OpenAPI parser: array-aware output schema", () => {
  it("keeps the collection flag when the response is an array of objects", async () => {
    const parser = new OpenApiParserService();

    const parsed = await parser.parse(
      specWith({ type: "array", items: ORG_ITEM }),
      SPEC_URL,
    );
    const endpoint = parsed.endpoints[0];

    expect(endpoint.outputIsArray).toBe(true);
    expect(endpoint.outputs.map((f) => f.key)).toEqual(["id", "inn", "amount"]);
    expect(endpoint.outputs.find((f) => f.key === "amount")?.type).toBe("number");
  });

  it("marks an object response as not a collection", async () => {
    const parser = new OpenApiParserService();

    const parsed = await parser.parse(specWith(ORG_ITEM), SPEC_URL);

    expect(parsed.endpoints[0].outputIsArray).toBe(false);
    expect(parsed.endpoints[0].outputs.map((f) => f.key)).toEqual(["id", "inn", "amount"]);
  });

  it("describes the element of an array field inside an object response", async () => {
    const parser = new OpenApiParserService();

    const parsed = await parser.parse(
      specWith({
        type: "object",
        properties: {
          total: { type: "integer" },
          items: { type: "array", items: ORG_ITEM },
        },
      }),
      SPEC_URL,
    );
    const endpoint = parsed.endpoints[0];

    expect(endpoint.outputIsArray).toBe(false);

    const items = endpoint.outputs.find((f) => f.key === "items");
    expect(items?.type).toBe("array");
    expect(items?.items?.map((f) => f.key)).toEqual(["id", "inn", "amount"]);
  });

  it("leaves an array of scalars without an element schema", async () => {
    const parser = new OpenApiParserService();

    const parsed = await parser.parse(
      specWith({
        type: "object",
        properties: { tags: { type: "array", items: { type: "string" } } },
      }),
      SPEC_URL,
    );

    const tags = parsed.endpoints[0].outputs.find((f) => f.key === "tags");
    expect(tags?.type).toBe("array");
    expect(tags?.items).toBeUndefined();
  });

});

describe("OpenAPI parser: endpoint tags", () => {
  const taggedSpec = {
    openapi: "3.0.0",
    info: { title: "Demo", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
    paths: {
      "/users": {
        get: { summary: "List users", tags: ["Users", "Admin"], responses: {} },
      },
      "/health": {
        get: { summary: "Health check", responses: {} },
      },
    },
  } as Record<string, unknown>;

  it("takes the first tag of an operation", async () => {
    const parser = new OpenApiParserService();
    const parsed = await parser.parse(taggedSpec, SPEC_URL);
    const users = parsed.endpoints.find((e) => e.path === "/users");

    expect(users?.tag).toBe("Users");
  });

  it("leaves the tag empty for an operation without tags", async () => {
    const parser = new OpenApiParserService();
    const parsed = await parser.parse(taggedSpec, SPEC_URL);
    const health = parsed.endpoints.find((e) => e.path === "/health");

    expect(health?.tag).toBeUndefined();
  });
});
