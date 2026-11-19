import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { compareSemver } from '../../common/utils/semver';
import { APP_VERSION_SEEDS, AppPlatform } from './app-version.constants';
import { AppVersionConfig } from './entities/app-version-config.entity';
import { UpdateAppVersionDto } from './dto/app-version.dto';

export type AppVersionSnapshot = {
  latestVersion: string;
  minimumSupportedVersion: string;
  updateEnabled: boolean;
  updateType: string;
  storeUrl: string;
  title: string;
  description: string;
};

@Injectable()
export class AppVersionService {
  constructor(
    @InjectRepository(AppVersionConfig)
    private readonly appVersionRepository: Repository<AppVersionConfig>,
  ) {}

  /** Returns the platform's config, creating it from the seed values if the row is missing. */
  async getForPlatform(platform: AppPlatform): Promise<AppVersionConfig> {
    const existing = await this.appVersionRepository.findOne({ where: { platform } });
    if (existing) return existing;

    try {
      return await this.appVersionRepository.save(
        this.appVersionRepository.create({ platform, ...APP_VERSION_SEEDS[platform], updatedById: null }),
      );
    } catch (error: unknown) {
      // Two first requests can race to seed the same row; the loser re-reads the winner's row.
      if ((error as { code?: string })?.code === '23505') {
        const seeded = await this.appVersionRepository.findOne({ where: { platform } });
        if (seeded) return seeded;
      }
      throw error;
    }
  }

  /** Shape returned to the Flutter app. Keep this contract stable. */
  toPublicPayload(config: AppVersionConfig) {
    return {
      latestVersion: config.latestVersion,
      minimumSupportedVersion: config.minimumSupportedVersion,
      platform: config.platform,
      updateEnabled: config.updateEnabled,
      updateType: config.updateType,
      storeUrl: config.storeUrl,
      title: config.title,
      description: config.description,
    };
  }

  snapshot(config: AppVersionConfig): AppVersionSnapshot {
    return {
      latestVersion: config.latestVersion,
      minimumSupportedVersion: config.minimumSupportedVersion,
      updateEnabled: config.updateEnabled,
      updateType: config.updateType,
      storeUrl: config.storeUrl,
      title: config.title,
      description: config.description,
    };
  }

  /**
   * Replaces the platform's config. Returns the values before and after so the
   * caller can write an audit entry.
   */
  async update(
    platform: AppPlatform,
    dto: UpdateAppVersionDto,
    adminId: string,
  ): Promise<{ before: AppVersionSnapshot; after: AppVersionConfig }> {
    // Format is already enforced by the DTO; the ordering rule needs both values.
    if (compareSemver(dto.minimumSupportedVersion, dto.latestVersion) > 0) {
      throw new BadRequestException('minimumSupportedVersion cannot be higher than latestVersion');
    }

    const config = await this.getForPlatform(platform);
    const before = this.snapshot(config);

    config.latestVersion = dto.latestVersion;
    config.minimumSupportedVersion = dto.minimumSupportedVersion;
    config.updateEnabled = dto.updateEnabled;
    config.updateType = dto.updateType;
    config.storeUrl = dto.storeUrl;
    config.title = dto.title;
    config.description = dto.description;
    config.updatedById = adminId;

    const after = await this.appVersionRepository.save(config);
    return { before, after };
  }
}
