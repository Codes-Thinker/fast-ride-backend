import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminAuditLogs1757400000000 implements MigrationInterface {
  name = 'CreateAdminAuditLogs1757400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "admin_id" uuid,
        "admin_name" character varying(100),
        "action" character varying(60) NOT NULL,
        "target_type" character varying(40),
        "target_id" character varying(64),
        "summary" character varying(255),
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_audit_logs_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_logs_admin_id" ON "admin_audit_logs" ("admin_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_logs_action" ON "admin_audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_logs"`);
  }
}
