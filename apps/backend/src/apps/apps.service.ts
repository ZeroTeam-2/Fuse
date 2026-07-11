import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { EndpointStatus } from "@fuse/shared";
import type {
  Endpoint,
  ImportPreviewResult,
  PaginatedResponse,
  ReimportDiff,
} from "@fuse/shared";
import { App, AppDocument } from "./app.schema";
import { OpenApiParserService } from "./openapi-parser";
import { SsrfGuard } from "./ssrf-guard";
import type { CreateAppDto } from "./dto/create-app.dto";
import type { ImportPreviewDto } from "./dto/import-preview.dto";
import type { UpdateAppDto } from "./dto/update-app.dto";

type EndpointSummary = Pick<Endpoint, "method" | "path" | "summary">;

function endpointKey(ep: { method: string; path: string }): string {
  return `${ep.method}:${ep.path}`;
}

function toSummary(ep: Endpoint): EndpointSummary {
  return { method: ep.method, path: ep.path, summary: ep.summary };
}

@Injectable()
export class AppsService {
  constructor(
    @InjectModel(App.name) private readonly appModel: Model<AppDocument>,
    private readonly openapiParser: OpenApiParserService,
    private readonly ssrfGuard: SsrfGuard,
  ) {}

  async findByOwner(
    ownerId: string,
    page = 1,
    limit = 20,
    onlyPublished = false,
  ): Promise<PaginatedResponse<AppDocument>> {
    const skip = (page - 1) * limit;
    // Pickers that build on other apps (e.g. add-step app select) must only
    // ever see published apps, from any owner, and never unpublished ones —
    // including the caller's own drafts.
    const filter = onlyPublished ? { published: true } : { ownerId };
    const [data, total] = await Promise.all([
      this.appModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.appModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async findById(id: string): Promise<AppDocument> {
    const app = await this.appModel.findById(id).exec();
    if (!app) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return app;
  }

  async create(ownerId: string, dto: CreateAppDto): Promise<AppDocument> {
    const rawSpec = await this.ssrfGuard.fetchSpec(dto.openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec);

    return new this.appModel({
      ownerId,
      name: dto.name,
      description: dto.description,
      openapiUrl: dto.openapiUrl,
      host: parsed.host,
      apiVersion: parsed.apiVersion,
      specSnapshot: parsed.specSnapshot,
      endpoints: parsed.endpoints,
      published: false,
      syncedAt: new Date(),
    }).save();
  }

  async importPreview(dto: ImportPreviewDto): Promise<ImportPreviewResult> {
    const rawSpec = await this.ssrfGuard.fetchSpec(dto.openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec);

    return {
      host: parsed.host,
      apiVersion: parsed.apiVersion,
      endpointCount: parsed.endpoints.length,
      endpoints: parsed.endpoints.map(toSummary),
    };
  }

  async reimport(id: string): Promise<ReimportDiff> {
    const app = await this.findById(id);

    const rawSpec = await this.ssrfGuard.fetchSpec(app.openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec);

    const oldKeys = new Set(app.endpoints.map(endpointKey));
    const newKeys = new Set(parsed.endpoints.map(endpointKey));

    const added: EndpointSummary[] = [];
    const kept: EndpointSummary[] = [];

    for (const ep of parsed.endpoints) {
      if (oldKeys.has(endpointKey(ep))) {
        kept.push(toSummary(ep));
      } else {
        added.push(toSummary(ep));
      }
    }

    const deprecated: EndpointSummary[] = app.endpoints
      .filter((ep) => !newKeys.has(endpointKey(ep)))
      .map(toSummary);

    return { added, deprecated, kept };
  }

  async applyReimport(id: string): Promise<AppDocument> {
    const app = await this.findById(id);

    const rawSpec = await this.ssrfGuard.fetchSpec(app.openapiUrl);
    const parsed = await this.openapiParser.parse(rawSpec);

    const oldEndpoints = new Map<string, Endpoint>();
    for (const ep of app.endpoints) {
      oldEndpoints.set(endpointKey(ep), ep);
    }

    const newKeys = new Set(parsed.endpoints.map(endpointKey));

    const merged: Endpoint[] = parsed.endpoints.map((ep) => {
      const existing = oldEndpoints.get(endpointKey(ep));
      return {
        ...ep,
        id: existing?.id ?? ep.id,
        status: EndpointStatus.ACTIVE,
      };
    });

    for (const [key, ep] of oldEndpoints) {
      if (!newKeys.has(key)) {
        merged.push({ ...ep, status: EndpointStatus.DEPRECATED });
      }
    }

    const updated = await this.appModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            endpoints: merged,
            host: parsed.host,
            apiVersion: parsed.apiVersion,
            specSnapshot: parsed.specSnapshot,
            syncedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return updated;
  }

  async togglePublish(id: string): Promise<AppDocument> {
    const app = await this.findById(id);
    const updated = await this.appModel
      .findByIdAndUpdate(
        id,
        { $set: { published: !app.published } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return updated;
  }

  async update(id: string, dto: UpdateAppDto): Promise<AppDocument> {
    const updated = await this.appModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return updated;
  }

  async delete(id: string): Promise<AppDocument> {
    const deleted = await this.appModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`App #${id} not found`);
    }
    return deleted;
  }
}
