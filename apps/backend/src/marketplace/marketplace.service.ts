import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SortOrder } from "@fuse/shared";
import type {
  CategoryCount,
  MarketplaceCard,
  MarketplaceQuery,
  PaginatedResponse,
  Step,
} from "@fuse/shared";
import { Scenario, ScenarioDocument } from "../scenarios/scenario.schema";
import { App, AppDocument } from "../apps/app.schema";

export interface ProviderDetail {
  appId: string;
  name: string;
  endpoints: {
    id: string;
    method: string;
    path: string;
    summary?: string;
  }[];
}

export interface MarketplaceCardDetail extends MarketplaceCard {
  description?: string;
  providersDetail: ProviderDetail[];
  // Шаги опубликованного сценария — публичные: по ним рисуется превью запуска
  // и playground, которые гость видит до входа.
  steps: Step[];
}

function extractAppIds(steps: Step[]): Set<string> {
  const appIds = new Set<string>();
  for (const step of steps) {
    if (step.type === "api" && step.appId) appIds.add(step.appId);
    if (step.type === "periodic" && step.appId) appIds.add(step.appId);
  }
  return appIds;
}

function countEndpoints(steps: Step[]): number {
  return steps.filter((s) => s.type === "api" || s.type === "periodic").length;
}

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectModel(Scenario.name) private readonly scenarioModel: Model<ScenarioDocument>,
    @InjectModel(App.name) private readonly appModel: Model<AppDocument>,
  ) {}

  async getCatalog(
    query: MarketplaceQuery,
  ): Promise<PaginatedResponse<MarketplaceCard>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { published: true };
    if (query.category) filter.category = query.category;
    if (query.subcategory) filter.subcategory = query.subcategory;
    if (query.search) {
      filter.title = { $regex: query.search, $options: "i" };
    }

    const sort: Record<string, -1 | 1> =
      query.sort === SortOrder.NEW
        ? { createdAt: -1 }
        : { runCount: -1 };

    const [scenarios, total] = await Promise.all([
      this.scenarioModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.scenarioModel.countDocuments(filter).exec(),
    ]);

    const allAppIds = new Set<string>();
    for (const s of scenarios) {
      for (const id of extractAppIds((s.steps ?? []) as Step[])) {
        allAppIds.add(id);
      }
    }

    const apps =
      allAppIds.size > 0
        ? await this.appModel
            .find({ _id: { $in: [...allAppIds] } })
            .select("_id name")
            .lean()
            .exec()
        : [];
    const appNameMap = new Map<string, string>(
      apps.map((a) => [a._id.toString(), a.name]),
    );

    const data: MarketplaceCard[] = scenarios.map((s) => {
      const steps = (s.steps ?? []) as Step[];
      const scenarioAppIds = extractAppIds(steps);
      const providers = [...scenarioAppIds]
        .map((id) => appNameMap.get(id))
        .filter((v): v is string => !!v);

      return {
        id: s._id.toString(),
        title: s.title,
        tagline: s.tagline ?? "",
        coverUrl: s.coverUrl,
        category: s.category,
        subcategory: s.subcategory,
        runCount: s.runCount ?? 0,
        providers,
        endpointCount: countEndpoints(steps),
        stepCount: steps.length,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async getCard(id: string): Promise<MarketplaceCardDetail> {
    const scenario = await this.scenarioModel.findById(id).lean().exec();

    if (!scenario || !scenario.published) {
      throw new NotFoundException(`Scenario #${id} not found`);
    }

    const steps = (scenario.steps ?? []) as Step[];
    const scenarioAppIds = [...extractAppIds(steps)];

    const apps =
      scenarioAppIds.length > 0
        ? await this.appModel
            .find({ _id: { $in: scenarioAppIds } })
            .select("_id name endpoints")
            .lean()
            .exec()
        : [];

    const providersDetail: ProviderDetail[] = apps.map((a) => ({
      appId: a._id.toString(),
      name: a.name,
      endpoints: (a.endpoints ?? []).map((ep) => ({
        id: ep.id,
        method: ep.method,
        path: ep.path,
        summary: ep.summary,
      })),
    }));

    const providers = providersDetail.map((p) => p.name);

    return {
      id: scenario._id.toString(),
      title: scenario.title,
      tagline: scenario.tagline ?? "",
      coverUrl: scenario.coverUrl,
      category: scenario.category,
      subcategory: scenario.subcategory,
      runCount: scenario.runCount ?? 0,
      providers,
      endpointCount: countEndpoints(steps),
      stepCount: steps.length,
      description: scenario.description,
      providersDetail,
      steps,
      blocked: scenario.blocked,
      blockedReason: scenario.blockedReason,
    };
  }

  async getCategoryCounts(
    query: Pick<MarketplaceQuery, "search">,
  ): Promise<CategoryCount[]> {
    const match: Record<string, unknown> = { published: true };
    if (query.search) {
      match.title = { $regex: query.search, $options: "i" };
    }

    const result = await this.scenarioModel
      .aggregate<{
        _id: { category: string | null; subcategory: string | null };
        count: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: {
              category: "$category",
              subcategory: "$subcategory",
            },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const categoryMap = new Map<
      string,
      { count: number; subcategories: Map<string, number> }
    >();

    for (const r of result) {
      const cat = r._id.category ?? "Без категории";
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { count: 0, subcategories: new Map() });
      }
      const entry = categoryMap.get(cat)!;
      entry.count += r.count;
      if (r._id.subcategory) {
        entry.subcategories.set(
          r._id.subcategory,
          (entry.subcategories.get(r._id.subcategory) ?? 0) + r.count,
        );
      }
    }

    return [...categoryMap.entries()].map(([category, val]) => ({
      category,
      count: val.count,
      subcategories: [...val.subcategories.entries()].map(([name, count]) => ({
        name,
        count,
      })),
    }));
  }
}
