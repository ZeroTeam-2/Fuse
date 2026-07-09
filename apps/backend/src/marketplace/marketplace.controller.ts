import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { MarketplaceService } from "./marketplace.service";
import { MarketplaceQueryDto } from "./dto/marketplace-query.dto";

@ApiTags("marketplace")
@Public()
@Controller("marketplace")
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get()
  @ApiOperation({ summary: "Browse marketplace catalog" })
  getCatalog(@Query() query: MarketplaceQueryDto) {
    return this.marketplaceService.getCatalog(query);
  }

  @Get("categories")
  @ApiOperation({ summary: "Get category tree with counts" })
  getCategoryCounts(@Query("search") search?: string) {
    return this.marketplaceService.getCategoryCounts({ search });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a marketplace card detail" })
  getCard(@Param("id") id: string) {
    return this.marketplaceService.getCard(id);
  }
}
