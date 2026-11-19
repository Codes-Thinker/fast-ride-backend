import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { SEMVER_PATTERN } from '../../../common/utils/semver';
import { SUPPORTED_PLATFORMS, UPDATE_TYPES } from '../app-version.constants';
import type { AppPlatform, AppUpdateType } from '../app-version.constants';

const SEMVER_MESSAGE = 'must be a semantic version like 1.0.1 (MAJOR.MINOR.PATCH)';

/** Optional ?platform= query. Defaults to android in the service. */
export class AppVersionQueryDto {
  @IsOptional()
  @IsIn(SUPPORTED_PLATFORMS as unknown as string[], {
    message: `platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
  })
  platform?: AppPlatform;
}

/** Full replacement payload for the admin PUT. All fields are required. */
export class UpdateAppVersionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(SEMVER_PATTERN, { message: `latestVersion ${SEMVER_MESSAGE}` })
  latestVersion!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(SEMVER_PATTERN, { message: `minimumSupportedVersion ${SEMVER_MESSAGE}` })
  minimumSupportedVersion!: string;

  // Read the raw JSON value: the global pipe's implicit conversion would turn "false" into true.
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean({ message: 'updateEnabled must be true or false' })
  updateEnabled!: boolean;

  @IsIn(UPDATE_TYPES as unknown as string[], {
    message: `updateType must be one of: ${UPDATE_TYPES.join(', ')}`,
  })
  updateType!: AppUpdateType;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true }, { message: 'storeUrl must be a valid https URL' })
  storeUrl!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'title must not be empty' })
  @MaxLength(120)
  title!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'description must not be empty' })
  @MaxLength(500)
  description!: string;
}
