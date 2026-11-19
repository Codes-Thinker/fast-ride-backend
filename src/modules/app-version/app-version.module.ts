import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppVersionController } from './app-version.controller';
import { AppVersionService } from './app-version.service';
import { AppVersionConfig } from './entities/app-version-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppVersionConfig])],
  controllers: [AppVersionController],
  providers: [AppVersionService],
  exports: [AppVersionService],
})
export class AppVersionModule {}
