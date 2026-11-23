import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('fare_settings')
export class FareSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'bike_first_km', type: 'decimal', precision: 10, scale: 2, default: 50 })
  bikeFirstKm!: string;

  @Column({ name: 'bike_after_2km', type: 'decimal', precision: 10, scale: 2, default: 16 })
  bikeAfter2Km!: string;

  @Column({ name: 'rikshaw_first_km', type: 'decimal', precision: 10, scale: 2, default: 65 })
  rikshawFirstKm!: string;

  @Column({ name: 'rikshaw_after_2km', type: 'decimal', precision: 10, scale: 2, default: 35 })
  rikshawAfter2Km!: string;

  @Column({ name: 'car_without_ac_first_km', type: 'decimal', precision: 10, scale: 2, default: 95 })
  carWithoutAcFirstKm!: string;

  @Column({ name: 'car_without_ac_after_2km', type: 'decimal', precision: 10, scale: 2, default: 45 })
  carWithoutAcAfter2Km!: string;

  @Column({ name: 'car_with_ac_first_km', type: 'decimal', precision: 10, scale: 2, default: 95 })
  carWithAcFirstKm!: string;

  @Column({ name: 'car_with_ac_after_2km', type: 'decimal', precision: 10, scale: 2, default: 45 })
  carWithAcAfter2Km!: string;

  @Column({ name: 'business_car_first_km', type: 'decimal', precision: 10, scale: 2, default: 115 })
  businessCarFirstKm!: string;

  @Column({ name: 'business_car_after_2km', type: 'decimal', precision: 10, scale: 2, default: 55 })
  businessCarAfter2Km!: string;

  @Column({ name: 'out_of_city_per_km', type: 'decimal', precision: 10, scale: 2, default: 45 })
  outOfCityPerKm!: string;

  @Column({ name: 'updated_by_id', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
