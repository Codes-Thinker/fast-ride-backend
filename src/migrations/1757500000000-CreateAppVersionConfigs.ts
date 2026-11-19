import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppVersionConfigs1757500000000 implements MigrationInterface {
  name = 'CreateAppVersionConfigs1757500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "app_version_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "platform" character varying(20) NOT NULL,
        "latest_version" character varying(20) NOT NULL,
        "minimum_supported_version" character varying(20) NOT NULL,
        "update_enabled" boolean NOT NULL DEFAULT true,
        "update_type" character varying(10) NOT NULL DEFAULT 'optional',
        "store_url" character varying(500) NOT NULL,
        "title" character varying(120) NOT NULL,
        "description" character varying(500) NOT NULL,
        "updated_by_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_version_configs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_app_version_configs_platform" UNIQUE ("platform")
      )`,
    );

    // Seed the live Android values. ON CONFLICT keeps any value an admin already saved.
    await queryRunner.query(
      `INSERT INTO "app_version_configs"
        ("platform", "latest_version", "minimum_supported_version", "update_enabled", "update_type", "store_url", "title", "description")
       VALUES (
        'android',
        '1.0.1',
        '1.0.1',
        true,
        'optional',
        'https://play.google.com/store/apps/details?id=com.fastridelive.app&hl=en',
        'New Update Available!',
        'We have made improvements and fixed bugs. Update now for the best FastRide experience.'
       )
       ON CONFLICT ("platform") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "app_version_configs"`);
  }
}
