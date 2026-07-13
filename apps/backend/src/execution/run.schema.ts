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

  // Некритичные замечания резолвера входов (неоднозначный фильтр массива).
  @Prop({ type: [String] })
  warnings?: string[];

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

/** Ввод, которого ждёт воркер: данные страницы шага либо добранные значения. */
@Schema({ _id: false })
export class PendingInputDoc {
  @Prop({ required: true })
  stepIndex: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  data: Record<string, unknown>;
}

const PendingInputSchema = SchemaFactory.createForClass(PendingInputDoc);

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

  /**
   * Значения ручного ввода по скоуп-ключам (`s0:inn`, `s2.s0:filter:status`):
   * собранные формой перед запуском плюс добранные по ходу. Переживают
   * перезапуск воркера — добранное не спрашивается повторно.
   */
  @Prop({ type: MongooseSchema.Types.Mixed })
  inputs?: Record<string, unknown>;

  /** Одноместный ящик: воркер ждёт его, пока `status === waiting_input`. */
  @Prop({ type: PendingInputSchema })
  pendingInput?: PendingInputDoc;

  /**
   * @deprecated Прежний ящик данных страницы. Воркер читает его, пока в полёте
   * есть запуски, созданные до появления `pendingInput`; убрать следующим change'ом.
   */
  @Prop({ type: MongooseSchema.Types.Mixed })
  pageData?: Record<string, unknown>;
}

export type RunDocument = HydratedDocument<Run>;
export const RunSchema = SchemaFactory.createForClass(Run);
