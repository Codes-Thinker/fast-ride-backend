// Strict MAJOR.MINOR.PATCH (no pre-release/build suffix). Matches the versionName
// Flutter publishes (e.g. "1.0.1"); the build number ("+6") is intentionally not part of it.
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isValidSemver(value: string): boolean {
  return SEMVER_PATTERN.test(value);
}

/**
 * Compares two strict semver strings numerically.
 * Returns a negative number when a < b, 0 when equal, positive when a > b.
 */
export function compareSemver(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
