import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FareSettings } from './entities/fare-settings.entity';
import { FareSettingsService } from './fare-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([FareSettings])],
  providers: [FareSettingsService],
  exports: [FareSettingsService],
})
export class FareSettingsModule {}
