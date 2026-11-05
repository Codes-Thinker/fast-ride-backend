import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToUsers1757300000000 implements MigrationInterface {
  name = 'AddDeletedAtToUsers1757300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
