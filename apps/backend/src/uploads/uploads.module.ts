import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  UploadSession,
  UploadSessionSchema,
} from "./upload-session.schema";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";
import { MinioModule } from "../minio/minio.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UploadSession.name, schema: UploadSessionSchema },
    ]),
    MinioModule,
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
