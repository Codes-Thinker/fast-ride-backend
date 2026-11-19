export const SUPPORTED_PLATFORMS = ['android'] as const;
export type AppPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export const UPDATE_TYPES = ['optional', 'force'] as const;
export type AppUpdateType = (typeof UPDATE_TYPES)[number];

export const DEFAULT_PLATFORM: AppPlatform = 'android';

/**
 * Seed values for each platform. Used by the migration on first deploy and as a
 * fallback when the row is missing (e.g. dev databases created via synchronize).
 * Reflects the app currently live on Google Play (versionName 1.0.1).
 */
export const APP_VERSION_SEEDS: Record<
  AppPlatform,
  {
    latestVersion: string;
    minimumSupportedVersion: string;
    updateEnabled: boolean;
    updateType: AppUpdateType;
    storeUrl: string;
    title: string;
    description: string;
  }
> = {
  android: {
    latestVersion: '1.0.1',
    minimumSupportedVersion: '1.0.1',
    updateEnabled: true,
    updateType: 'optional',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.fastridelive.app&hl=en',
    title: 'New Update Available!',
    description: 'We have made improvements and fixed bugs. Update now for the best FastRide experience.',
  },
};
