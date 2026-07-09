import { Injectable, LoggerService } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  [key: string]: unknown;
}

@Injectable()
export class LoggingService implements LoggerService {
  private readonly logCollectorUrl: string | undefined;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.logCollectorUrl = this.configService.get<string>("LOG_COLLECTOR_URL");
    this.enabled = this.configService.get<string>("MONIUM_ENABLED") === "true";
  }

  log(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.write("info", message, context, meta);
  }

  error(
    message: string,
    trace?: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.write("error", message, context, { ...meta, trace });
  }

  warn(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, context, meta);
  }

  debug(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, context, meta);
  }

  verbose(
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.write("verbose", message, context, meta);
  }

  fatal(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.write("fatal", message, context, meta);
  }

  private write(
    level: string,
    message: string,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      ...meta,
    };

    const json = JSON.stringify(entry);

    if (level === "error" || level === "fatal") {
      process.stderr.write(json + "\n");
    } else {
      process.stdout.write(json + "\n");
    }

    if (this.enabled && this.logCollectorUrl) {
      this.sendToCollector(entry).catch(() => {});
    }
  }

  private async sendToCollector(entry: LogEntry): Promise<void> {
    try {
      await fetch(this.logCollectorUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Silently fail — logging should never crash the app
    }
  }
}
