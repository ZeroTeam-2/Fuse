import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "minio";

/**
 * minio ждёт в endPoint голый хост ("localhost", "s3.twcstorage.ru") и падает
 * с InvalidEndpointError, если передать URL со схемой. Внешние S3 при этом
 * удобнее задавать именно URL-ом, поэтому разбираем обе формы: схема задаёт
 * useSSL и порт по умолчанию (443/80), явный S3_PORT его переопределяет.
 */
export function parseS3Endpoint(
  s3Url: string,
  s3Port?: number,
): { endPoint: string; port: number; useSSL: boolean } {
  const hasScheme = /^https?:\/\//i.test(s3Url);
  if (!hasScheme) {
    return { endPoint: s3Url, port: s3Port ?? 9000, useSSL: false };
  }

  const url = new URL(s3Url);
  const useSSL = url.protocol === "https:";
  const portFromUrl = url.port ? Number(url.port) : undefined;
  return {
    endPoint: url.hostname,
    port: portFromUrl ?? s3Port ?? (useSSL ? 443 : 80),
    useSSL,
  };
}

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client!: Client;
  private bucket!: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.bucket = this.configService.get<string>("S3_BUCKET") ?? "fuse";

    const { endPoint, port, useSSL } = parseS3Endpoint(
      this.configService.get<string>("S3_URL") ?? "localhost",
      this.configService.get<number>("S3_PORT"),
    );

    this.client = new Client({
      endPoint,
      port,
      useSSL,
      accessKey: this.configService.get<string>("S3_ACCESS_KEY") ?? "minioadmin",
      secretKey: this.configService.get<string>("S3_SECRET_KEY") ?? "minioadmin",
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

  /** Объект целиком в память: файлы ограничены лимитами загрузки (file-limits). */
  async getObjectBuffer(objectName: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, objectName);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    }
    return Buffer.concat(chunks);
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
