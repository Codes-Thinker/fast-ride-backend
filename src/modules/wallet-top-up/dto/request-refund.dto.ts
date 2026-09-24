import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestRefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer' })
  reason?: string;
}
