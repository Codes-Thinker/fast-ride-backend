import { Controller, Get, Header, HttpCode, Query } from '@nestjs/common';
import { DEFAULT_PLATFORM } from './app-version.constants';
import { AppVersionQueryDto } from './dto/app-version.dto';
import { AppVersionService } from './app-version.service';

/** Public endpoint polled by the Flutter app on launch. No auth. */
@Controller('api/app-version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async getAppVersion(@Query() query: AppVersionQueryDto) {
    const config = await this.appVersionService.getForPlatform(query.platform ?? DEFAULT_PLATFORM);
    return {
      success: true,
      data: this.appVersionService.toPublicPayload(config),
    };
  }
}
