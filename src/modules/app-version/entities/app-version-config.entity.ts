import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { AppPlatform, AppUpdateType } from '../app-version.constants';

// One row per platform. Declared here so `synchronize` in development matches the
// migration (see migrations/1757500000000-CreateAppVersionConfigs.ts).
@Entity('app_version_configs')
@Unique('UQ_app_version_configs_platform', ['platform'])
export class AppVersionConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  platform!: AppPlatform;

  @Column({ name: 'latest_version', type: 'varchar', length: 20 })
  latestVersion!: string;

  @Column({ name: 'minimum_supported_version', type: 'varchar', length: 20 })
  minimumSupportedVersion!: string;

  @Column({ name: 'update_enabled', type: 'boolean', default: true })
  updateEnabled!: boolean;

  @Column({ name: 'update_type', type: 'varchar', length: 10, default: 'optional' })
  updateType!: AppUpdateType;

  @Column({ name: 'store_url', type: 'varchar', length: 500 })
  storeUrl!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
