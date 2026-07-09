import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { WorkerService } from "./execution/worker.service";

async function bootstrapWorker() {
  const logger = new Logger("Worker");

  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(ConfigService);

  logger.log("Worker process starting...");
  logger.log(`Redis: ${configService.get<string>("REDIS_URL")}`);

  const workerService = app.get(WorkerService);
  workerService.start();

  logger.log("Worker ready — listening for scenario execution jobs");

  process.on("SIGTERM", async () => {
    logger.log("SIGTERM received, shutting down worker...");
    await workerService.stop();
    await app.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.log("SIGINT received, shutting down worker...");
    await workerService.stop();
    await app.close();
    process.exit(0);
  });
}

bootstrapWorker().catch((err) => {
  console.error("Worker bootstrap failed:", err);
  process.exit(1);
});
