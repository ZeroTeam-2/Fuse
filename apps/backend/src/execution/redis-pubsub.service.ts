import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { ServerWsEvent } from "@fuse/shared";

@Injectable()
export class RedisPubSubService implements OnModuleInit {
  private publisher: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.publisher = new Redis(url);
  }

  async publish(runId: string, event: ServerWsEvent): Promise<void> {
    await this.publisher.publish(`run:${runId}`, JSON.stringify(event));
  }

  createSubscriber(): Redis {
    const url = this.configService.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    return new Redis(url);
  }
}
