import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RideVehicleType } from '../../common/utils/fare-calculator';
import { FareSettings } from './entities/fare-settings.entity';
import { UpdateFareSettingsDto } from './dto/update-fare-settings.dto';

@Injectable()
export class FareSettingsService {
  constructor(
    @InjectRepository(FareSettings)
    private readonly repository: Repository<FareSettings>,
  ) {}

  async get(): Promise<FareSettings> {
    const existing = await this.repository.findOne({ where: {} });
    if (existing) return existing;

    try {
      return await this.repository.save(this.repository.create({}));
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === '23505') {
        const seeded = await this.repository.findOne({ where: {} });
        if (seeded) return seeded;
      }
      throw error;
    }
  }

  async update(dto: UpdateFareSettingsDto, adminId: string): Promise<FareSettings> {
    const settings = await this.get();
    settings.updatedById = adminId;
    Object.assign(settings, dto);
    return this.repository.save(settings);
  }

  cityRates(settings: FareSettings): Record<RideVehicleType, { baseFare: number; afterTwoKm: number }> {
    return {
      bike: { baseFare: Number(settings.bikeFirstKm), afterTwoKm: Number(settings.bikeAfter2Km) },
      rikshaw: { baseFare: Number(settings.rikshawFirstKm), afterTwoKm: Number(settings.rikshawAfter2Km) },
      car_without_ac: { baseFare: Number(settings.carWithoutAcFirstKm), afterTwoKm: Number(settings.carWithoutAcAfter2Km) },
      car_with_ac: { baseFare: Number(settings.carWithAcFirstKm), afterTwoKm: Number(settings.carWithAcAfter2Km) },
      business_car: { baseFare: Number(settings.businessCarFirstKm), afterTwoKm: Number(settings.businessCarAfter2Km) },
    };
  }
}
