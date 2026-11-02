import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { SortOrder } from "@fuse/shared";
import type { MarketplaceQuery } from "@fuse/shared";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

export class MarketplaceQueryDto extends PaginationQueryDto implements MarketplaceQuery {
  @ApiPropertyOptional({ example: "Данные" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: "Обогащение данных" })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({ example: "проверка" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.POPULAR })
  @IsOptional()
  @IsEnum(SortOrder)
  sort?: SortOrder = SortOrder.POPULAR;
}
