import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { UploadsService } from "./uploads.service";
import { InitChunkedUploadDto } from "./dto/init-chunked-upload.dto";

@ApiTags("uploads")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("single")
  @ApiOperation({ summary: "Upload a single file (≤ 10 MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor("file"))
  async singleUpload(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    const result = await this.uploadsService.singleUpload(
      req.user.userId,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    return result;
  }

  @Post("chunked/init")
  @ApiOperation({ summary: "Initialize a chunked upload session" })
  initChunkedUpload(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InitChunkedUploadDto,
  ) {
    return this.uploadsService.initChunkedUpload(
      req.user.userId,
      dto.fileName,
      dto.fileSize,
      dto.contentType,
    );
  }

  @Post("chunked/:uploadId/part/:partNumber")
  @ApiOperation({ summary: "Upload a single chunk" })
  async uploadPart(
    @Param("uploadId") uploadId: string,
    @Param("partNumber") partNumber: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) _res: Response,
  ) {
    const partNum = Number(partNumber);
    if (Number.isNaN(partNum) || partNum < 1) {
      throw new BadRequestException("Invalid part number");
    }

    const chunks: Buffer[] = [];
    const stream = req as unknown as NodeJS.ReadableStream;
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    }
    const buffer = Buffer.concat(chunks);

    const result = await this.uploadsService.uploadPart(
      uploadId,
      partNum,
      buffer,
    );

    return result;
  }

  @Post("chunked/:uploadId/complete")
  @ApiOperation({ summary: "Complete a chunked upload" })
  completeChunkedUpload(@Param("uploadId") uploadId: string) {
    return this.uploadsService.completeChunkedUpload(uploadId);
  }

  @Post("chunked/:uploadId/abort")
  @ApiOperation({ summary: "Abort a chunked upload and clean up parts" })
  async abortChunkedUpload(@Param("uploadId") uploadId: string) {
    await this.uploadsService.abortChunkedUpload(uploadId);
    return { aborted: true };
  }

  @Get("chunked/:uploadId")
  @ApiOperation({ summary: "Get upload session status (for resume)" })
  getUploadStatus(@Param("uploadId") uploadId: string) {
    return this.uploadsService.getUploadStatus(uploadId);
  }
}
