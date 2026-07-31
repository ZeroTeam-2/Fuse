/**
 * Smoke-тест локальной инфраструктуры: очередь + DLQ существуют, бакет
 * существует, round-trip в SQS и S3 проходит.
 *
 * Запуск: pnpm test:infra (требует поднятой инфраструктуры: pnpm infra).
 *
 * Намеренно вынесен из обычного `pnpm test` (суффикс `.infra-spec.ts` не
 * попадает под include с `*.spec.ts`): юнит-тесты не должны падать только от
 * того, что докер не запущен.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { Client as MinioClient } from "minio";

const rootDir = resolve(import.meta.dirname, "../../..");
const localEnv = resolve(rootDir, ".env.local");
if (existsSync(localEnv)) process.loadEnvFile(localEnv);
process.loadEnvFile(resolve(rootDir, ".env"));

const HINT = "Инфраструктура не отвечает. Выполните: pnpm infra";

// Короткие таймауты: при опущенной инфраструктуре тест должен падать с внятным
// сообщением, а не висеть на ретраях SDK.
const sqs = new SQSClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  },
  maxAttempts: 1,
  requestHandler: { requestTimeout: 5000, connectionTimeout: 3000 },
});

const minio = new MinioClient({
  endPoint: process.env.S3_URL ?? "localhost",
  port: Number(process.env.S3_PORT ?? 9000),
  useSSL: false,
  accessKey: process.env.S3_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.S3_SECRET_KEY ?? "minioadmin",
});

const bucket = process.env.S3_BUCKET ?? "fuse";
const queueUrl = process.env.AWS_SQS_QUEUE_URL!;

describe("локальная инфраструктура", () => {
  beforeAll(() => {
    if (!queueUrl?.includes("localhost") && !queueUrl?.includes("127.0.0.1")) {
      throw new Error(
        `AWS_SQS_QUEUE_URL указывает не на локальную очередь (${queueUrl}). ` +
          "Включите локальный профиль: cp .env.local.example .env.local",
      );
    }
  });

  it("очередь scenario-execution существует", async () => {
    const res = await sqs
      .send(new GetQueueUrlCommand({ QueueName: "scenario-execution" }))
      .catch((e: Error) => {
        throw new Error(`${HINT}\n${e.message}`);
      });
    expect(res.QueueUrl).toBeTruthy();
  });

  it("у очереди настроена DLQ", async () => {
    const res = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["RedrivePolicy"],
      }),
    );
    const redrive = res.Attributes?.RedrivePolicy;
    expect(redrive, "у очереди нет RedrivePolicy — DLQ не настроена").toBeTruthy();
    expect(JSON.parse(redrive!).deadLetterTargetArn).toContain("scenario-execution-dlq");
  });

  it("round-trip: сообщение уходит в очередь и читается обратно", async () => {
    // Отдельная временная очередь, а не очередь приложения: если рядом запущен
    // `pnpm dev`, воркер бэкенда подберёт тестовое сообщение раньше нас, и тест
    // будет падать (или, что хуже, зеленеть только при выключенном бэкенде).
    const tempQueue = await sqs.send(
      new CreateQueueCommand({ QueueName: `smoke-roundtrip-${Date.now()}` }),
    );
    const tempUrl = tempQueue.QueueUrl!;

    try {
      const body = `smoke-${Date.now()}`;
      await sqs.send(new SendMessageCommand({ QueueUrl: tempUrl, MessageBody: body }));

      const received = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: tempUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5,
        }),
      );
      const found = received.Messages?.find((m) => m.Body === body);
      expect(found, "отправленное сообщение не вернулось из очереди").toBeTruthy();

      await sqs.send(
        new DeleteMessageCommand({ QueueUrl: tempUrl, ReceiptHandle: found!.ReceiptHandle! }),
      );
    } finally {
      await sqs.send(new DeleteQueueCommand({ QueueUrl: tempUrl }));
    }
  });

  it("бакет существует", async () => {
    const exists = await minio.bucketExists(bucket).catch((e: Error) => {
      throw new Error(`${HINT}\n${e.message}`);
    });
    expect(exists, `бакета «${bucket}» нет — выполните pnpm infra`).toBe(true);
  });

  it("round-trip: объект загружается и скачивается из S3", async () => {
    const key = `smoke-${Date.now()}.txt`;
    const payload = "infra smoke";

    await minio.putObject(bucket, key, Buffer.from(payload));
    const stream = await minio.getObject(bucket, key);
    const chunks: Buffer[] = [];
    await new Promise<void>((res, rej) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => res());
      stream.on("error", rej);
    });
    expect(Buffer.concat(chunks).toString()).toBe(payload);

    await minio.removeObject(bucket, key);
  });
});
