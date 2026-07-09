import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

@Schema({ timestamps: true })
export class Scenario {
  @Prop({ required: true })
  ownerId: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  tagline?: string;

  @Prop()
  description?: string;

  @Prop()
  coverUrl?: string;

  @Prop()
  category?: string;

  @Prop()
  subcategory?: string;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  steps: unknown[];

  @Prop({ default: false })
  published: boolean;

  @Prop({ default: 0 })
  runCount: number;
}

export type ScenarioDocument = HydratedDocument<Scenario>;
export const ScenarioSchema = SchemaFactory.createForClass(Scenario);
