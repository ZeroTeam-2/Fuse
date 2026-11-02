import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import type { PaginationQuery } from "@fuse/shared";

/**
 * Страница и размер страницы — одни и те же для всех списочных ручек.
 * Наследники добавляют только свои фильтры: `class-validator` берёт метаданные
 * декораторов и с базового класса, поэтому `whitelist`/`forbidNonWhitelisted`
 * продолжают работать (проверено `pagination-query.spec.ts`).
 */
export class PaginationQueryDto implements PaginationQuery {
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
}
