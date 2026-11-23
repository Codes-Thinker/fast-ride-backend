import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateFareSettingsDto {
  @Type(() => Number) @IsNumber() @Min(0) bikeFirstKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) bikeAfter2Km!: number;
  @Type(() => Number) @IsNumber() @Min(0) rikshawFirstKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) rikshawAfter2Km!: number;
  @Type(() => Number) @IsNumber() @Min(0) carWithoutAcFirstKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) carWithoutAcAfter2Km!: number;
  @Type(() => Number) @IsNumber() @Min(0) carWithAcFirstKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) carWithAcAfter2Km!: number;
  @Type(() => Number) @IsNumber() @Min(0) businessCarFirstKm!: number;
  @Type(() => Number) @IsNumber() @Min(0) businessCarAfter2Km!: number;
  @Type(() => Number) @IsNumber() @Min(0) outOfCityPerKm!: number;
}
