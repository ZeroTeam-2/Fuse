import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";
import { RunStatus } from "@fuse/shared";

@Schema({ _id: false })
export class RunStepResultDoc {
  @Prop({ required: true })
  stepIndex: number;

  @Prop({ required: true })
  stepTitle: string;

  @Prop({
    required: true,
    type: String,
    default: "pending",
  })
  status: "pending" | "running" | "completed" | "failed";

  @Prop({ type: MongooseSchema.Types.Mixed })
  result?: unknown;

  @Prop()
  error?: string;

  @Prop()
  startedAt?: string;

  @Prop()
  finishedAt?: string;

  @Prop()
  durationMs?: number;
}

const RunStepResultSchema = SchemaFactory.createForClass(RunStepResultDoc);

@Schema({ timestamps: true })
export class Run {
  @Prop({ required: true })
  scenarioId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, type: String, default: RunStatus.PENDING })
  status: RunStatus;

  @Prop({ type: [RunStepResultSchema], default: [] })
  stepResults: RunStepResultDoc[];

  @Prop({ default: 0 })
  currentStep: number;

  @Prop()
  error?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  pageData?: Record<string, unknown>;
}

export type RunDocument = HydratedDocument<Run>;
export const RunSchema = SchemaFactory.createForClass(Run);
