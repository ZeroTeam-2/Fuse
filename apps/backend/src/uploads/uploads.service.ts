import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomUUID } from "node:crypto";
import { MinioService } from "../minio/minio.service";
import {
  UploadSession,
  UploadSessionDocument,
  UploadStatus,
} from "./upload-session.schema";

const DEFAULT_PART_SIZE = 5 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  "text/csv",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/zip",
  "text/plain",
];

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly maxSingleMb: number;

  constructor(
    @InjectModel(UploadSession.name)
    private readonly sessionModel: Model<UploadSessionDocument>,
    private readonly minioService: MinioService,
    private readonly configService: ConfigService,
  ) {
    this.maxSingleMb = this.configService.get<number>("FILE_SINGLE_UPLOAD_MAX_MB") ?? 10;
  }

  getMaxSingleUploadBytes(): number {
    return this.maxSingleMb * 1024 * 1024;
  }

  isAllowedContentType(contentType: string): boolean {
    return ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase());
  }

  shouldUseChunked(fileSize: number): boolean {
    return fileSize > this.getMaxSingleUploadBytes();
  }

  async singleUpload(
    userId: string,
    fileName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ objectName: string; url: string }> {
    if (buffer.length > this.getMaxSingleUploadBytes()) {
      throw new BadRequestException(
        `File exceeds single upload limit of ${this.maxSingleMb} MB`,
      );
    }

    const objectName = this.buildObjectName(userId, fileName);
    await this.minioService.uploadFile(objectName, buffer, contentType);
    const url = await this.minioService.getPresignedUrl(objectName);

    return { objectName, url };
  }

  async initChunkedUpload(
    userId: string,
    fileName: string,
    fileSize: number,
    contentType: string,
  ): Promise<{ uploadId: string }> {
    if (!this.shouldUseChunked(fileSize)) {
      throw new BadRequestException(
        `File size ${fileSize} bytes does not require chunked upload (limit: ${this.maxSingleMb} MB)`,
      );
    }

    const objectName = this.buildObjectName(userId, fileName);
    const minioUploadId = await this.minioService.initiateMultipartUpload(
      objectName,
      contentType,
    );

    const session = await new this.sessionModel({
      userId,
      fileName,
      fileSize,
      contentType,
      objectName,
      minioUploadId,
      parts: [],
      status: UploadStatus.INITIATED,
    }).save();

    this.logger.log(`Initiated chunked upload ${session._id} for ${fileName}`);
    return { uploadId: session._id.toString() };
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    buffer: Buffer,
  ): Promise<{ partNumber: number; etag: string; uploadedBytes: number }> {
    const session = await this.findSession(uploadId);

    if (session.status === UploadStatus.COMPLETED) {
      throw new BadRequestException("Upload already completed");
    }
    if (session.status === UploadStatus.ABORTED) {
      throw new BadRequestException("Upload was aborted");
    }

    const result = await this.minioService.uploadPart(
      session.objectName,
      session.minioUploadId,
      partNumber,
      buffer,
      session.contentType,
    );

    await this.sessionModel
      .updateOne(
        { _id: session._id },
        {
          $push: { parts: { partNumber, etag: result.etag, size: buffer.length } },
          $set: { status: UploadStatus.IN_PROGRESS },
        },
      )
      .exec();

    return {
      partNumber,
      etag: result.etag,
      uploadedBytes: buffer.length,
    };
  }

  async completeChunkedUpload(
    uploadId: string,
  ): Promise<{ objectName: string; url: string }> {
    const session = await this.findSession(uploadId);

    if (session.status === UploadStatus.COMPLETED) {
      throw new BadRequestException("Upload already completed");
    }
    if (session.status === UploadStatus.ABORTED) {
      throw new BadRequestException("Upload was aborted");
    }

    const sortedParts = [...session.parts].sort(
      (a, b) => a.partNumber - b.partNumber,
    );

    const objectName = await this.minioService.completeMultipartUpload(
      session.objectName,
      session.minioUploadId,
      sortedParts.map((p) => ({ part: p.partNumber, etag: p.etag })),
    );

    await this.sessionModel
      .updateOne(
        { _id: session._id },
        { $set: { status: UploadStatus.COMPLETED } },
      )
      .exec();

    const url = await this.minioService.getPresignedUrl(objectName);

    this.logger.log(`Completed chunked upload ${uploadId}`);
    return { objectName, url };
  }

  async abortChunkedUpload(uploadId: string): Promise<void> {
    const session = await this.findSession(uploadId);

    await this.minioService.abortMultipartUpload(
      session.objectName,
      session.minioUploadId,
    );

    await this.sessionModel
      .updateOne(
        { _id: session._id },
        { $set: { status: UploadStatus.ABORTED } },
      )
      .exec();

    this.logger.log(`Aborted chunked upload ${uploadId}`);
  }

  async getUploadStatus(uploadId: string): Promise<{
    uploadId: string;
    fileName: string;
    fileSize: number;
    status: UploadStatus;
    uploadedParts: { partNumber: number; size: number }[];
    uploadedBytes: number;
  }> {
    const session = await this.findSession(uploadId);

    const uploadedBytes = session.parts.reduce((sum, p) => sum + p.size, 0);

    return {
      uploadId: session._id.toString(),
      fileName: session.fileName,
      fileSize: session.fileSize,
      status: session.status,
      uploadedParts: session.parts.map((p) => ({
        partNumber: p.partNumber,
        size: p.size,
      })),
      uploadedBytes,
    };
  }

  private async findSession(
    uploadId: string,
  ): Promise<UploadSessionDocument> {
    const session = await this.sessionModel.findById(uploadId).exec();
    if (!session) {
      throw new NotFoundException(`Upload session #${uploadId} not found`);
    }
    return session;
  }

  private buildObjectName(userId: string, fileName: string): string {
    const ext = fileName.includes(".")
      ? fileName.slice(fileName.lastIndexOf("."))
      : "";
    return `uploads/${userId}/${randomUUID()}${ext}`;
  }
}

export { DEFAULT_PART_SIZE };
