import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export const UploadStatus = {
  INITIATED: "initiated",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  ABORTED: "aborted",
} as const;

export type UploadStatus = (typeof UploadStatus)[keyof typeof UploadStatus];

@Schema({ _id: false })
export class UploadPartDoc {
  @Prop({ required: true, type: Number })
  partNumber: number;

  @Prop({ required: true, type: String })
  etag: string;

  @Prop({ required: true, type: Number })
  size: number;
}

const UploadPartDocSchema = SchemaFactory.createForClass(UploadPartDoc);

@Schema({ timestamps: true })
export class UploadSession {
  @Prop({ required: true, type: String })
  userId: string;

  @Prop({ required: true, type: String })
  fileName: string;

  @Prop({ required: true, type: Number })
  fileSize: number;

  @Prop({ required: true, type: String })
  contentType: string;

  @Prop({ required: true, type: String })
  objectName: string;

  @Prop({ required: true, type: String })
  minioUploadId: string;

  @Prop({ type: [UploadPartDocSchema], default: [] })
  parts: UploadPartDoc[];

  @Prop({ required: true, type: String, default: UploadStatus.INITIATED })
  status: UploadStatus;
}

export type UploadSessionDocument = HydratedDocument<UploadSession>;
export const UploadSessionSchema = SchemaFactory.createForClass(UploadSession);
