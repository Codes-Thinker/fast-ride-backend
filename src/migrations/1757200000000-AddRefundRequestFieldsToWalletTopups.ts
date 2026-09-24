import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundRequestFieldsToWalletTopups1757200000000
  implements MigrationInterface
{
  name = 'AddRefundRequestFieldsToWalletTopups1757200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_topups" ADD COLUMN IF NOT EXISTS "refund_reason" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_topups" ADD COLUMN IF NOT EXISTS "refund_requested_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_topups" ADD COLUMN IF NOT EXISTS "refund_rejection_reason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_topups" DROP COLUMN IF EXISTS "refund_rejection_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_topups" DROP COLUMN IF EXISTS "refund_requested_at"`,
    );
    await queryRunner.query(`ALTER TABLE "wallet_topups" DROP COLUMN IF EXISTS "refund_reason"`);
  }
}
