import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "minio";

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client!: Client;
  private bucket!: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.bucket = this.configService.get<string>("MINIO_BUCKET") ?? "fuse";

    this.client = new Client({
      endPoint: this.configService.get<string>("MINIO_ENDPOINT") ?? "localhost",
      port: this.configService.get<number>("MINIO_PORT") ?? 9000,
      useSSL: false,
      accessKey: this.configService.get<string>("MINIO_ACCESS_KEY") ?? "minioadmin",
      secretKey: this.configService.get<string>("MINIO_SECRET_KEY") ?? "minioadmin",
    });

    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created bucket: ${this.bucket}`);
      }
    } catch (err) {
      this.logger.warn(`MinIO init deferred: ${(err as Error).message}`);
    }
  }

  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
      "Content-Type": contentType,
    });
    return objectName;
  }

  async getPresignedUrl(objectName: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectName, 24 * 60 * 60);
  }

  async deleteFile(objectName: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectName);
  }

  async initiateMultipartUpload(
    objectName: string,
    contentType: string,
  ): Promise<string> {
    return this.client.initiateNewMultipartUpload(
      this.bucket,
      objectName,
      { "Content-Type": contentType },
    );
  }

  async uploadPart(
    objectName: string,
    uploadId: string,
    partNumber: number,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ etag: string; part: number }> {
    const result = await this.client.uploadPart(
      {
        bucketName: this.bucket,
        objectName,
        uploadID: uploadId,
        partNumber,
        headers: { "Content-Type": contentType },
      },
      buffer,
    );
    return { etag: result.etag, part: result.part };
  }

  async completeMultipartUpload(
    objectName: string,
    uploadId: string,
    parts: { part: number; etag?: string }[],
  ): Promise<string> {
    await this.client.completeMultipartUpload(
      this.bucket,
      objectName,
      uploadId,
      parts,
    );
    return objectName;
  }

  async abortMultipartUpload(
    objectName: string,
    uploadId: string,
  ): Promise<void> {
    await this.client.abortMultipartUpload(this.bucket, objectName, uploadId);
  }
}
