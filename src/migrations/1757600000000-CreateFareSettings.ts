import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFareSettings1757600000000 implements MigrationInterface {
  name = 'CreateFareSettings1757600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "fare_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bike_first_km" numeric(10,2) NOT NULL DEFAULT 50,
        "bike_after_2km" numeric(10,2) NOT NULL DEFAULT 16,
        "rikshaw_first_km" numeric(10,2) NOT NULL DEFAULT 65,
        "rikshaw_after_2km" numeric(10,2) NOT NULL DEFAULT 35,
        "car_without_ac_first_km" numeric(10,2) NOT NULL DEFAULT 95,
        "car_without_ac_after_2km" numeric(10,2) NOT NULL DEFAULT 45,
        "car_with_ac_first_km" numeric(10,2) NOT NULL DEFAULT 95,
        "car_with_ac_after_2km" numeric(10,2) NOT NULL DEFAULT 45,
        "business_car_first_km" numeric(10,2) NOT NULL DEFAULT 115,
        "business_car_after_2km" numeric(10,2) NOT NULL DEFAULT 55,
        "out_of_city_per_km" numeric(10,2) NOT NULL DEFAULT 45,
        "updated_by_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fare_settings_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(`INSERT INTO "fare_settings" ("id") VALUES (uuid_generate_v4())`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "fare_settings"`);
  }
}
