import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";
import { EndpointStatus, HttpMethod, ParamLocation } from "@fuse/shared";
import type { SchemaField } from "@fuse/shared";

@Schema({ _id: false })
export class SchemaFieldDoc {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true, type: String })
  type: SchemaField["type"];

  @Prop({ type: String })
  loc?: ParamLocation;

  @Prop({ type: MongooseSchema.Types.Mixed })
  ex?: unknown;

  @Prop({ default: false })
  required?: boolean;

  // Element fields of an `array`. Mixed rather than a self-referencing subschema:
  // one level deep is all the parser produces.
  @Prop({ type: MongooseSchema.Types.Mixed })
  items?: SchemaField[];
}

const SchemaFieldDocSchema = SchemaFactory.createForClass(SchemaFieldDoc);

@Schema({ _id: false })
export class EndpointDoc {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  method: HttpMethod;

  @Prop({ required: true })
  path: string;

  @Prop()
  summary?: string;

  // First OpenAPI tag of the operation — groups endpoints into collapsible blocks.
  @Prop()
  tag?: string;

  @Prop({ type: [SchemaFieldDocSchema], default: [] })
  inputs: SchemaFieldDoc[];

  @Prop({ type: [SchemaFieldDocSchema], default: [] })
  outputs: SchemaFieldDoc[];

  // The endpoint answers with a collection, so `outputs` describe one element.
  @Prop({ default: false })
  outputIsArray?: boolean;

  @Prop({ default: EndpointStatus.ACTIVE })
  status: EndpointStatus;
}

const EndpointDocSchema = SchemaFactory.createForClass(EndpointDoc);

@Schema({ _id: false })
export class VariableDoc {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true, default: "" })
  value: string;
}

const VariableDocSchema = SchemaFactory.createForClass(VariableDoc);

@Schema({ _id: false })
export class EnvironmentDoc {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  // Extensible set; today the only member is `baseUrl`.
  @Prop({ type: [VariableDocSchema], default: [] })
  variables: VariableDoc[];
}

const EnvironmentDocSchema = SchemaFactory.createForClass(EnvironmentDoc);

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class App {
  @Prop({ required: true })
  ownerId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  // Optional: file-imported apps have no spec URL to fetch from.
  @Prop()
  openapiUrl?: string;

  // Absolute base every endpoint path is resolved against at execution time.
  // Optional on the schema so pre-existing apps load; the worker rejects a step
  // whose app has none rather than falling back to a guess.
  @Prop()
  baseUrl?: string;

  @Prop()
  host?: string;

  @Prop()
  apiVersion?: string;

  @Prop({ type: [EndpointDocSchema], default: [] })
  endpoints: EndpointDoc[];

  // Environments of the provider; the default `Prod` cannot be deleted and its
  // `baseUrl` variable seeds from `baseUrl` above. Empty for pre-existing apps
  // until they are opened or backfilled (execution falls back to `baseUrl`).
  @Prop({ type: [EnvironmentDocSchema], default: [] })
  environments: EnvironmentDoc[];

  @Prop({ default: false })
  published: boolean;

  @Prop()
  syncedAt?: Date;
}

export type AppDocument = HydratedDocument<App>;
export const AppSchema = SchemaFactory.createForClass(App);
