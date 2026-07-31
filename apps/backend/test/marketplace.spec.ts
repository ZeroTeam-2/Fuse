import { describe, it, expect, vi, beforeEach } from "vitest";
import { SortOrder } from "@fuse/shared";

vi.mock("../src/scenarios/scenario.schema", () => ({
  Scenario: { name: "Scenario" },
  ScenarioSchema: {},
  ScenarioDocument: {},
}));
vi.mock("../src/apps/app.schema", () => ({
  App: { name: "App" },
  AppSchema: {},
  AppDocument: {},
}));

import { MarketplaceService } from "../src/marketplace/marketplace.service";

type LeanDoc = {
  _id: { toString(): string };
  [key: string]: unknown;
};

function createMockModel(data: LeanDoc[]) {
  const mockModel: any = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        skip: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockReturnValue({
              exec: vi.fn().mockResolvedValue(data),
            }),
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    countDocuments: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(data.length),
    }),
    findById: vi.fn().mockReturnValue({
      lean: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(data[0] ?? null),
      }),
    }),
    aggregate: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    }),
  };
  return mockModel;
}

describe("MarketplaceService", () => {
  let service: MarketplaceService;
  let mockScenarioModel: any;
  let mockAppModel: any;

  const scenarios: LeanDoc[] = [
    {
      _id: { toString: () => "s1" },
      title: "Проверка контрагента",
      tagline: "Быстрая проверка",
      category: "Данные",
      subcategory: "Проверка и комплаенс",
      published: true,
      runCount: 150,
      steps: [
        { type: "api", appId: "a1", endpointId: "e1", method: "GET", path: "/check" },
        { type: "delay", seconds: 3 },
      ],
    },
    {
      _id: { toString: () => "s2" },
      title: "Распознавание документов",
      tagline: "OCR за секунды",
      category: "Документы",
      subcategory: "Распознавание",
      published: true,
      runCount: 300,
      steps: [
        { type: "api", appId: "a2", endpointId: "e2", method: "POST", path: "/ocr" },
      ],
    },
    {
      _id: { toString: () => "s3" },
      title: "Проверка паспорта",
      tagline: "Комплаенс",
      category: "Данные",
      subcategory: "Проверка и комплаенс",
      published: true,
      runCount: 50,
      steps: [
        { type: "api", appId: "a1", endpointId: "e3", method: "POST", path: "/passport" },
        { type: "api", appId: "a2", endpointId: "e4", method: "GET", path: "/verify" },
      ],
    },
  ];

  const apps = [
    {
      _id: { toString: () => "a1" },
      name: "DataService",
      endpoints: [
        { id: "e1", method: "GET", path: "/check", summary: "Check" },
        { id: "e3", method: "POST", path: "/passport", summary: "Passport" },
      ],
    },
    {
      _id: { toString: () => "a2" },
      name: "OCRService",
      endpoints: [
        { id: "e2", method: "POST", path: "/ocr", summary: "OCR" },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockScenarioModel = createMockModel(scenarios);
    mockAppModel = {
      find: vi.fn().mockImplementation((filter: any) => {
        const ids: string[] = filter._id?.$in ?? [];
        const filtered = apps.filter((a) => ids.includes(a._id.toString()));
        return {
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockReturnValue({
              exec: vi.fn().mockResolvedValue(filtered),
            }),
          }),
        };
      }),
    };
    service = new MarketplaceService(mockScenarioModel, mockAppModel, {
      forSteps: vi.fn().mockResolvedValue([]),
    } as any);
  });

  describe("getCatalog", () => {
    it("returns paginated cards", async () => {
      const result = await service.getCatalog({});

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it("computes card fields correctly", async () => {
      const result = await service.getCatalog({});

      const card = result.data[0];
      expect(card.id).toBe("s1");
      expect(card.title).toBe("Проверка контрагента");
      expect(card.stepCount).toBe(2);
      expect(card.endpointCount).toBe(1);
      expect(card.providers).toContain("DataService");
    });

    it("applies popular sort (runCount desc)", async () => {
      await service.getCatalog({ sort: SortOrder.POPULAR });

      const findChain = mockScenarioModel.find.mock.results[0].value;
      const sortCall = findChain.sort.mock;

      expect(sortCall.calls[0][0]).toEqual({ runCount: -1 });
    });

    it("applies new sort (createdAt desc)", async () => {
      await service.getCatalog({ sort: SortOrder.NEW });

      const findChain = mockScenarioModel.find.mock.results[0].value;
      const sortCall = findChain.sort.mock;

      expect(sortCall.calls[0][0]).toEqual({ createdAt: -1 });
    });

    it("builds filter with category", async () => {
      await service.getCatalog({ category: "Данные" });

      const filterArg = mockScenarioModel.find.mock.calls[0][0];
      expect(filterArg).toEqual({
        published: true,
        category: "Данные",
      });
    });

    it("builds filter with search regex", async () => {
      await service.getCatalog({ search: "паспорт" });

      const filterArg = mockScenarioModel.find.mock.calls[0][0];
      expect(filterArg.published).toBe(true);
      expect(filterArg.title).toEqual({
        $regex: "паспорт",
        $options: "i",
      });
    });

    it("builds filter with subcategory", async () => {
      await service.getCatalog({
        category: "Данные",
        subcategory: "Проверка и комплаенс",
      });

      const filterArg = mockScenarioModel.find.mock.calls[0][0];
      expect(filterArg.category).toBe("Данные");
      expect(filterArg.subcategory).toBe("Проверка и комплаенс");
    });

    it("defaults to popular sort when no sort provided", async () => {
      await service.getCatalog({});

      const findChain = mockScenarioModel.find.mock.results[0].value;
      expect(findChain.sort.mock.calls[0][0]).toEqual({ runCount: -1 });
    });
  });

  describe("getCard", () => {
    it("returns card detail with providers and endpoints", async () => {
      mockScenarioModel.findById = vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(scenarios[0]),
        }),
      });

      const card = await service.getCard("s1");

      expect(card.id).toBe("s1");
      expect(card.title).toBe("Проверка контрагента");
      expect(card.providersDetail).toHaveLength(1);
      expect(card.providersDetail[0].name).toBe("DataService");
      expect(card.providersDetail[0].endpoints).toHaveLength(2);
    });

    it("throws NotFoundException for unpublished scenario", async () => {
      mockScenarioModel.findById = vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({
            ...scenarios[0],
            published: false,
          }),
        }),
      });

      await expect(service.getCard("s1")).rejects.toThrow("not found");
    });

    it("throws NotFoundException for missing scenario", async () => {
      mockScenarioModel.findById = vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(null),
        }),
      });

      await expect(service.getCard("unknown")).rejects.toThrow("not found");
    });
  });

  describe("getCategoryCounts", () => {
    it("aggregates categories", async () => {
      mockScenarioModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: { category: "Данные", subcategory: "Проверка и комплаенс" },
            count: 2,
          },
          {
            _id: { category: "Документы", subcategory: "Распознавание" },
            count: 1,
          },
        ]),
      });

      const result = await service.getCategoryCounts({});

      expect(result).toHaveLength(2);
      const data = result.find((c) => c.category === "Данные");
      expect(data?.count).toBe(2);
      expect(data?.subcategories[0].name).toBe("Проверка и комплаенс");
      expect(data?.subcategories[0].count).toBe(2);
    });

    it("handles null category", async () => {
      mockScenarioModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([
          {
            _id: { category: null, subcategory: null },
            count: 1,
          },
        ]),
      });

      const result = await service.getCategoryCounts({});

      expect(result[0].category).toBe("Без категории");
    });

    it("applies search filter to aggregation", async () => {
      mockScenarioModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      await service.getCategoryCounts({ search: "тест" });

      const pipeline = mockScenarioModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.published).toBe(true);
      expect(pipeline[0].$match.title).toEqual({
        $regex: "тест",
        $options: "i",
      });
    });
  });
});
