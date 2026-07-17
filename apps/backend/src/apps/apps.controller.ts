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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { AppsService } from "./apps.service";
import { CreateAppDto } from "./dto/create-app.dto";
import { ImportPreviewDto } from "./dto/import-preview.dto";
import { UpdateAppDto } from "./dto/update-app.dto";
import { FileImportDto, ImportPreviewFileDto } from "./dto/file-import.dto";
import { PaginationQueryDto } from "./dto/pagination-query.dto";
import {
  CreateEnvironmentDto,
  UpdateEnvironmentDto,
} from "./dto/environment.dto";

const ALLOWED_SPEC_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function validateSpecFile(file: Express.Multer.File): void {
  if (!file) {
    throw new BadRequestException("File is required");
  }
  const ext = getExtension(file.originalname);
  if (!ALLOWED_SPEC_EXTENSIONS.has(ext)) {
    throw new BadRequestException("Допустимы только файлы .json, .yaml, .yml");
  }
}

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
  findById(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.appsService.findById(id, req.user.userId);
  }

  @Post("import-preview")
  @ApiOperation({ summary: "Preview an OpenAPI spec import" })
  importPreview(@Body() dto: ImportPreviewDto) {
    return this.appsService.importPreview(dto);
  }

  @Post("import-preview-file")
  @ApiOperation({
    summary: "Preview an OpenAPI spec import from an uploaded file",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        baseUrl: {
          type: "string",
          format: "url",
          description: "Required when the spec has no absolute servers[0].url",
        },
      },
    },
  })
  // Лимит размера (SPEC_FILE_MAX_MB) задаётся через MulterModule.registerAsync
  // в AppsModule — конфиг-driven, без магического числа в декораторе.
  @UseInterceptors(FileInterceptor("file"))
  async importPreviewFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportPreviewFileDto,
  ) {
    validateSpecFile(file);
    return this.appsService.importPreviewFile(
      file.buffer.toString("utf-8"),
      file.mimetype,
      dto.baseUrl,
    );
  }

  @Post("from-file")
  @ApiOperation({
    summary: "Create a new app from an uploaded OpenAPI spec file",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        name: {
          type: "string",
          example: "My API",
        },
        description: {
          type: "string",
        },
        baseUrl: {
          type: "string",
          format: "url",
          description: "Required when the spec has no absolute servers[0].url",
        },
      },
      required: ["file", "name"],
    },
  })
  // Лимит размера (SPEC_FILE_MAX_MB) задаётся через MulterModule.registerAsync
  // в AppsModule — конфиг-driven, без магического числа в декораторе.
  @UseInterceptors(FileInterceptor("file"))
  async createFromFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: FileImportDto,
    @Req() req: AuthenticatedRequest,
  ) {
    validateSpecFile(file);
    return this.appsService.createFromFile(req.user.userId, {
      name: dto.name,
      description: dto.description || undefined,
      specText: file.buffer.toString("utf-8"),
      contentType: file.mimetype,
      baseUrlOverride: dto.baseUrl,
    });
  }

  @Post()
  @ApiOperation({ summary: "Create a new app from an OpenAPI spec" })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAppDto) {
    return this.appsService.create(req.user.userId, dto);
  }

  @Post(":id/reimport")
  @ApiOperation({ summary: "Reimport an app's spec and return a diff" })
  reimport(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.appsService.reimport(id, req.user.userId);
  }

  @Post(":id/reimport/apply")
  @ApiOperation({
    summary: "Apply a reimport: re-parse the spec and merge endpoints",
  })
  applyReimport(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.appsService.applyReimport(id, req.user.userId);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update app metadata" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAppDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.appsService.update(id, req.user.userId, dto);
  }

  @Patch(":id/publish")
  @ApiOperation({ summary: "Toggle app published status" })
  togglePublish(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.appsService.togglePublish(id, req.user.userId);
  }

  @Post(":id/environments")
  @ApiOperation({ summary: "Add an environment to an app" })
  addEnvironment(
    @Param("id") id: string,
    @Body() dto: CreateEnvironmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.appsService.addEnvironment(id, req.user.userId, dto);
  }

  @Patch(":id/environments/:envId")
  @ApiOperation({ summary: "Update an app environment (name / Base URL)" })
  updateEnvironment(
    @Param("id") id: string,
    @Param("envId") envId: string,
    @Body() dto: UpdateEnvironmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.appsService.updateEnvironment(id, req.user.userId, envId, dto);
  }

  @Delete(":id/environments/:envId")
  @ApiOperation({ summary: "Delete an app environment (Prod cannot be deleted)" })
  deleteEnvironment(
    @Param("id") id: string,
    @Param("envId") envId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.appsService.deleteEnvironment(id, req.user.userId, envId);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete an app" })
  delete(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.appsService.delete(id, req.user.userId);
  }
}
