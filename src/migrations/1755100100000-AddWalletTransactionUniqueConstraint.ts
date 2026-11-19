import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletTransactionUniqueConstraint1755100100000 implements MigrationInterface {
  name = 'AddWalletTransactionUniqueConstraint1755100100000';

  // Guarantees at most one ride_earning row and one commission_debit row per
  // ride_request_id. Postgres treats every NULL as distinct for uniqueness,
  // so withdrawal / adjustment rows (ride_request_id IS NULL) are unaffected
  // and can repeat freely.
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, and this constraint may
    // already exist (declared on the entity, and possibly created earlier by
    // `synchronize`), so the migration has to handle an existing object.
    // Postgres reports a clash with an existing object of the same name as 42P07
    // (duplicate_table) when that object is an index, so the old handler (which
    // only caught duplicate_object) failed on databases that already had it.
    // Instead of swallowing errors, check the existing definition: a unique index
    // on exactly (ride_request_id, type) is accepted, anything else fails loudly
    // and the whole migration run is rolled back.
    await queryRunner.query(`
      DO $$
      DECLARE
        existing text;
      BEGIN
        SELECT indexdef INTO existing FROM pg_indexes
         WHERE indexname = 'UQ_wallet_transactions_ride_request_type';

        IF existing IS NULL THEN
          ALTER TABLE "wallet_transactions"
            ADD CONSTRAINT "UQ_wallet_transactions_ride_request_type" UNIQUE ("ride_request_id", "type");
        ELSIF NOT (existing LIKE 'CREATE UNIQUE INDEX%' AND position('(ride_request_id, type)' IN existing) > 0) THEN
          RAISE EXCEPTION 'UQ_wallet_transactions_ride_request_type exists but is not UNIQUE (ride_request_id, type): %', existing;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "UQ_wallet_transactions_ride_request_type"`,
    );
  }
}
