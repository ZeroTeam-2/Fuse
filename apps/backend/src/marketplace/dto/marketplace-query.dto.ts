import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { SortOrder } from "@fuse/shared";

export class MarketplaceQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

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
