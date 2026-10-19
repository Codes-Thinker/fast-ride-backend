export type RideVehicleType =
  | 'bike'
  | 'rikshaw'
  | 'car_without_ac'
  | 'car_with_ac'
  | 'business_car';

export type RideServiceArea = 'city' | 'out_of_city';

const CITY_TWO_STAGE_RATES: Record<RideVehicleType, { baseFare: number; afterTwoKm: number }> = {
  bike: { baseFare: 50, afterTwoKm: 16 },
  rikshaw: { baseFare: 65, afterTwoKm: 35 },
  car_without_ac: { baseFare: 95, afterTwoKm: 45 },
  car_with_ac: { baseFare: 95, afterTwoKm: 45 },
  business_car: { baseFare: 115, afterTwoKm: 55 },
};

const OUT_OF_CITY_RATE = 45;
const CITY_RATE_THRESHOLD_KM = 2;
const COMPANY_COMMISSION_RATE = 0.15;

export interface FareBreakdown {
  estimatedDistanceKm: number;
  baseFare: number;
  companyCommission: number;
  driverPayout: number;
  totalFare: number;
}

export function calculateRideFare(input: {
  vehicleType: RideVehicleType;
  serviceArea: RideServiceArea;
  estimatedDistanceKm: number;
}): FareBreakdown {
  const distanceKm = Math.max(input.estimatedDistanceKm, 0);

  if (input.serviceArea === 'out_of_city') {
    const totalFare = roundMoney(distanceKm * OUT_OF_CITY_RATE);
    return buildBreakdown(distanceKm, totalFare);
  }

  const rate = CITY_TWO_STAGE_RATES[input.vehicleType];
  const totalFare =
    distanceKm <= CITY_RATE_THRESHOLD_KM
      ? rate.baseFare
      : roundMoney(
          rate.baseFare + (distanceKm - CITY_RATE_THRESHOLD_KM) * rate.afterTwoKm,
        );

  return buildBreakdown(distanceKm, totalFare);
}

export function calculateDistanceKm(input: {
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffLatitude: number;
  dropoffLongitude: number;
}): number {
  const earthRadiusKm = 6371;
  const pickupLatitudeRadians = degreesToRadians(input.pickupLatitude);
  const dropoffLatitudeRadians = degreesToRadians(input.dropoffLatitude);
  const latitudeDelta = degreesToRadians(input.dropoffLatitude - input.pickupLatitude);
  const longitudeDelta = degreesToRadians(input.dropoffLongitude - input.pickupLongitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(pickupLatitudeRadians) *
      Math.cos(dropoffLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return roundMoney(2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildBreakdown(estimatedDistanceKm: number, totalFare: number): FareBreakdown {
  const companyCommission = roundMoney(totalFare * COMPANY_COMMISSION_RATE);
  const driverPayout = roundMoney(totalFare - companyCommission);

  return {
    estimatedDistanceKm: roundMoney(estimatedDistanceKm),
    baseFare: totalFare,
    companyCommission,
    driverPayout,
    totalFare,
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}