import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { AppsService } from "./apps.service";
import { CreateAppDto } from "./dto/create-app.dto";
import { ImportPreviewDto } from "./dto/import-preview.dto";
import { UpdateAppDto } from "./dto/update-app.dto";
import { PaginationQueryDto } from "./dto/pagination-query.dto";

@ApiTags("apps")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("apps")
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @Get()
  @ApiOperation({
    summary:
      "List apps (paginated): by default the caller's own apps, or — with published=true — any published app from any owner",
  })
  findByOwner(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.appsService.findByOwner(
      req.user.userId,
      query.page,
      query.limit,
      query.published,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single app" })
  findById(@Param("id") id: string) {
    return this.appsService.findById(id);
  }

  @Post("import-preview")
  @ApiOperation({ summary: "Preview an OpenAPI spec import" })
  importPreview(@Body() dto: ImportPreviewDto) {
    return this.appsService.importPreview(dto);
  }

  @Post()
  @ApiOperation({ summary: "Create a new app from an OpenAPI spec" })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateAppDto,
  ) {
    return this.appsService.create(req.user.userId, dto);
  }

  @Post(":id/reimport")
  @ApiOperation({ summary: "Reimport an app's spec and return a diff" })
  reimport(@Param("id") id: string) {
    return this.appsService.reimport(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update app metadata" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAppDto,
  ) {
    return this.appsService.update(id, dto);
  }

  @Patch(":id/publish")
  @ApiOperation({ summary: "Toggle app published status" })
  togglePublish(@Param("id") id: string) {
    return this.appsService.togglePublish(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete an app" })
  delete(@Param("id") id: string) {
    return this.appsService.delete(id);
  }
}
