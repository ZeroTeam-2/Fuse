import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";
import { MinioService } from "../minio/minio.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { randomUUID } from "crypto";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly minioService: MinioService,
  ) {}

  @Get("me")
  @ApiOperation({ summary: "Get current user profile" })
  getMe(@Req() req: AuthenticatedRequest) {
    return this.usersService.findById(req.user.userId);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update current user profile" })
  updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.userId, dto);
  }

  @Post("me/avatar")
  @ApiOperation({ summary: "Upload avatar" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async uploadAvatar(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded");
    }
    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("Only image files are allowed");
    }

    const objectName = `avatars/${req.user.userId}/${randomUUID()}`;
    await this.minioService.uploadFile(objectName, file.buffer, file.mimetype);
    const avatarUrl = await this.minioService.getPresignedUrl(objectName);

    return this.usersService.updateAvatar(
      req.user.userId,
      avatarUrl,
      objectName,
    );
  }

  @Delete("me/avatar")
  @ApiOperation({ summary: "Delete avatar" })
  async deleteAvatar(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.findById(req.user.userId);
    if (user.avatarObjectId) {
      await this.minioService.deleteFile(user.avatarObjectId);
    }
    return this.usersService.removeAvatar(req.user.userId);
  }
}
