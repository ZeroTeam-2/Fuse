import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerAppModule } from "./worker-app.module";

/**
 * Entrypoint воркер-процесса: `createApplicationContext`, а не `create` —
 * HTTP-сервера, Swagger и socket.io-адаптера здесь нет. Консьюмер SQS
 * стартует хуком `onApplicationBootstrap` в `WorkerService`.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule);

  // SIGTERM → consumer.stop(): новые сообщения не берутся. Сообщение в полёте
  // при убийстве контейнера вернётся в очередь по visibility timeout.
  app.enableShutdownHooks();

  const logger = new Logger("WorkerBootstrap");
  const concurrency = process.env.WORKER_CONCURRENCY ?? "5";
  logger.log(`Worker process started — concurrency ${concurrency}`);
}

bootstrap().catch((err) => {
  console.error("Worker bootstrap failed:", err);
  process.exit(1);
});
