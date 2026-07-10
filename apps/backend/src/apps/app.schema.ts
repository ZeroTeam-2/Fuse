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

  @Prop({ type: [SchemaFieldDocSchema], default: [] })
  inputs: SchemaFieldDoc[];

  @Prop({ type: [SchemaFieldDocSchema], default: [] })
  outputs: SchemaFieldDoc[];

  @Prop({ default: EndpointStatus.ACTIVE })
  status: EndpointStatus;
}

const EndpointDocSchema = SchemaFactory.createForClass(EndpointDoc);

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class App {
  @Prop({ required: true })
  ownerId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  openapiUrl: string;

  @Prop()
  host?: string;

  @Prop()
  apiVersion?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  specSnapshot?: unknown;

  @Prop({ type: [EndpointDocSchema], default: [] })
  endpoints: EndpointDoc[];

  @Prop({ default: false })
  published: boolean;

  @Prop()
  syncedAt?: Date;
}

export type AppDocument = HydratedDocument<App>;
export const AppSchema = SchemaFactory.createForClass(App);
