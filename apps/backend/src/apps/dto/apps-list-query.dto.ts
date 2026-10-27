import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

export class AppsListQueryDto extends PaginationQueryDto {
  /**
   * When true, return any published app regardless of owner (and hide
   * unpublished ones) instead of the default "apps owned by me" listing.
   * Used by pickers (e.g. add-step app select) that must only ever surface
   * published apps.
   */
  @ApiPropertyOptional({
    description: "Return any published app (any owner) instead of only the caller's apps",
  })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  published?: boolean;
}
