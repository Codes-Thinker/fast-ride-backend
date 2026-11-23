import { BadRequestException, Injectable } from '@nestjs/common';
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
    try {
      const existing = await this.repository.findOne({ where: {} });
      if (existing) return existing;
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === '42P01') {
        return this.defaultSettings();
      }
      throw error;
    }

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
    let settings: FareSettings;
    try {
      settings = await this.get();
    } catch {
      throw new BadRequestException('Fare settings migration is not installed');
    }
    if (!settings.id || settings.id === 'fare-settings-not-persisted') {
      throw new BadRequestException('Fare settings migration is not installed');
    }
    settings.updatedById = adminId;
    Object.assign(settings, dto);
    return this.repository.save(settings);
  }

  private defaultSettings(): FareSettings {
    const now = new Date();
    return this.repository.create({
      id: 'fare-settings-not-persisted',
      bikeFirstKm: '50',
      bikeAfter2Km: '16',
      rikshawFirstKm: '65',
      rikshawAfter2Km: '35',
      carWithoutAcFirstKm: '95',
      carWithoutAcAfter2Km: '45',
      carWithAcFirstKm: '95',
      carWithAcAfter2Km: '45',
      businessCarFirstKm: '115',
      businessCarAfter2Km: '55',
      outOfCityPerKm: '45',
      updatedById: null,
      createdAt: now,
      updatedAt: now,
    });
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
