import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ unique: true, sparse: true })
  yandexId?: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ default: "" })
  lastName: string;

  @Prop()
  avatarUrl?: string;

  @Prop()
  avatarObjectId?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
