import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional } from 'class-validator';

export class EstimateFareDto {
  @Type(() => Number)
  @IsNumber()
  pickupLatitude!: number;

  @Type(() => Number)
  @IsNumber()
  pickupLongitude!: number;

  @Type(() => Number)
  @IsNumber()
  dropoffLatitude!: number;

  @Type(() => Number)
  @IsNumber()
  dropoffLongitude!: number;

  @IsOptional()
  @IsIn(['city', 'out_of_city'])
  serviceArea?: string;

  /** Prefer Google road-route distance from the client over haversine. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedDistanceKm?: number;
}
