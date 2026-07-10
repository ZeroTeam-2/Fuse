import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { IoAdapter } from "@nestjs/platform-socket.io";
import cookieParser from "cookie-parser";
import type { Express } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(cookieParser());

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  app.enableCors({
    origin: appUrl,
    credentials: true,
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Fuse API")
    .setDescription("Fuse backend REST API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const expressApp = app.getHttpAdapter().getInstance() as Express;

  expressApp.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });

  expressApp.get("/api/docs", apiReference({ spec: { content: document } }));
  expressApp.get("/api/schema.json", (_req, res) => {
    res.json(document);
  });

  const port = Number(process.env.PORT ?? 3001);
  const retryDelayMs = Number(process.env.PORT_BIND_RETRY_DELAY_MS ?? 500);

  
  try {
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
    console.log(`Scalar API Docs: http://localhost:${port}/api/docs`);
  } catch (err) {
    const isAddrInUse =
      err !== null &&
      typeof err === "object" &&
      (err as NodeJS.ErrnoException).code === "EADDRINUSE";

    if (!isAddrInUse) {
      if (isAddrInUse) {
        console.error(
          `Port ${port} is still in use after attempts. ` +
            `Another process may be holding it — check with \`lsof -i :${port}\`.`,
        );
      }
      throw err;
    }

    console.warn(
      `Port ${port} is already in use (attempt); ` +
        `retrying in ${retryDelayMs}ms...`,
    );
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  
}

bootstrap();
