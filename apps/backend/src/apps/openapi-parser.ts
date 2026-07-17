import { Injectable, BadRequestException } from "@nestjs/common";
import { dereference } from "@readme/openapi-parser";
import { randomUUID } from "crypto";
import { EndpointStatus, HttpMethod, ParamLocation } from "@fuse/shared";
import type { Endpoint, SchemaField } from "@fuse/shared";
import { deriveBaseUrl } from "./base-url";

interface OpenAPIParameter {
  name: string;
  in: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: { type?: string; example?: unknown };
  example?: unknown;
  type?: string;
}

interface OpenAPISchemaObject {
  type?: string;
  properties?: Record<string, OpenAPISchemaObject>;
  required?: string[];
  items?: OpenAPISchemaObject;
  example?: unknown;
  description?: string;
}

interface OpenAPIRequestBody {
  content?: Record<string, { schema?: OpenAPISchemaObject; example?: unknown }>;
  required?: boolean;
}

interface OpenAPIResponse {
  content?: Record<string, { schema?: OpenAPISchemaObject; example?: unknown }>;
  description?: string;
}

interface OpenAPIOperation {
  summary?: string;
  description?: string;
  deprecated?: boolean;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
}

interface OpenAPIPathItem {
  parameters?: OpenAPIParameter[];
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
}

interface OpenAPIDocument {
  openapi?: string;
  swagger?: string;
  info?: { version?: string; title?: string };
  servers?: { url: string }[];
  host?: string;
  basePath?: string;
  paths?: Record<string, OpenAPIPathItem>;
}

export interface ParsedSpec {
  baseUrl?: string;
  host?: string;
  apiVersion?: string;
  endpoints: Endpoint[];
}

const VALID_METHODS = new Set(["get", "post", "put", "delete", "patch"]);

@Injectable()
export class OpenApiParserService {
  async parse(
    rawSpec: Record<string, unknown>,
    openapiUrl: string,
    options?: { baseUrlOverride?: string },
  ): Promise<ParsedSpec> {
    let spec: OpenAPIDocument;
    try {
      spec = (await dereference(rawSpec as never)) as OpenAPIDocument;
    } catch {
      throw new BadRequestException("Failed to parse OpenAPI specification");
    }

    let baseUrl = deriveBaseUrl(spec, openapiUrl);
    if (baseUrl === undefined && options?.baseUrlOverride) {
      baseUrl = options.baseUrlOverride;
    }

    return {
      baseUrl,
      host: this.extractHost(baseUrl),
      apiVersion: spec.info?.version,
      endpoints: this.extractEndpoints(spec),
    };
  }

  // `host` — производное от baseUrl и живёт только для отображения в UI.
  private extractHost(baseUrl?: string): string | undefined {
    if (!baseUrl) return undefined;
    try {
      return new URL(baseUrl).host;
    } catch {
      return undefined;
    }
  }

  private extractEndpoints(spec: OpenAPIDocument): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const paths = spec.paths ?? {};

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;

      const pathParameters = pathItem.parameters ?? [];

      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === "parameters") continue;
        if (!VALID_METHODS.has(method.toLowerCase())) continue;
        if (!operation) continue;

        const allParameters = [...pathParameters, ...(operation.parameters ?? [])];

        const { fields: outputs, isArray } = this.extractOutputs(operation);

        endpoints.push({
          id: randomUUID(),
          method: method.toUpperCase() as HttpMethod,
          path,
          summary: operation.summary,
          inputs: this.extractInputs(operation, allParameters),
          outputs,
          outputIsArray: isArray,
          status: operation.deprecated
            ? EndpointStatus.DEPRECATED
            : EndpointStatus.ACTIVE,
        });
      }
    }

    return endpoints;
  }

  private extractInputs(
    operation: OpenAPIOperation,
    parameters: OpenAPIParameter[],
  ): SchemaField[] {
    const fields: SchemaField[] = [];

    for (const param of parameters) {
      const loc = this.mapParamLocation(param.in);
      if (!loc) continue;

      fields.push({
        key: param.name,
        label: param.name,
        type: this.mapSchemaType(param.schema?.type ?? param.type),
        loc,
        ex: param.example ?? param.schema?.example,
        required: param.required ?? false,
      });
    }

    if (operation.requestBody) {
      const schema = this.getFirstContentSchema(
        operation.requestBody.content,
      );
      if (schema) {
        fields.push(...this.extractSchemaFields(schema, ParamLocation.BODY));
      }
    }

    return fields;
  }

  /**
   * A collection response is still described by its element's fields, but the
   * fact that it *is* a collection travels alongside them — scenario steps need
   * it to know a filter is required to pick one element.
   */
  private extractOutputs(operation: OpenAPIOperation): {
    fields: SchemaField[];
    isArray: boolean;
  } {
    const responses = operation.responses ?? {};
    const successCode = Object.keys(responses).find(
      (code) => code.startsWith("2") || code === "default",
    );
    if (!successCode) return { fields: [], isArray: false };

    const response = responses[successCode];
    const schema = this.getFirstContentSchema(response?.content);
    if (!schema) return { fields: [], isArray: false };

    return {
      fields: this.extractSchemaFields(schema),
      isArray: schema.type === "array",
    };
  }

  private extractSchemaFields(
    schema: OpenAPISchemaObject,
    loc?: ParamLocation,
  ): SchemaField[] {
    const target = schema.type === "array" ? schema.items : schema;
    if (!target?.properties) return [];

    return Object.entries(target.properties).map(([key, prop]) => {
      const field: SchemaField = {
        key,
        label: key,
        type: this.mapSchemaType(prop.type),
        loc,
        ex: prop.example,
        required: target.required?.includes(key) ?? false,
      };

      // One level deep, like everything else here: an array of objects gets its
      // element's fields, so a filter can be built on them.
      if (prop.type === "array" && prop.items?.properties) {
        field.items = this.extractSchemaFields(prop.items, loc);
      }

      return field;
    });
  }

  private getFirstContentSchema(
    content?: Record<string, { schema?: OpenAPISchemaObject }>,
  ): OpenAPISchemaObject | undefined {
    if (!content) return undefined;
    const first = Object.values(content)[0];
    return first?.schema;
  }

  private mapParamLocation(inValue: string): ParamLocation | undefined {
    switch (inValue) {
      case "path":
        return ParamLocation.PATH;
      case "query":
        return ParamLocation.QUERY;
      case "header":
        return ParamLocation.HEADER;
      default:
        return undefined;
    }
  }

  private mapSchemaType(type?: string): SchemaField["type"] {
    switch (type) {
      case "string":
        return "string";
      case "number":
      case "integer":
        return "number";
      case "boolean":
        return "boolean";
      case "array":
        return "array";
      case "object":
        return "object";
      case "file":
        return "file";
      default:
        return "string";
    }
  }
}
