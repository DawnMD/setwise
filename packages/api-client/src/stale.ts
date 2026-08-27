/** Shared cache lifetimes. Applications still own their QueryClient lifecycle. */
export const STALE = {
  home: 15_000,
  catalogue: 5 * 60_000,
  stats: 5 * 60_000,
  plans: 2 * 60_000,
  activeSession: 15_000,
  openSession: Infinity,
  lastPerformance: Infinity,
  profile: 5 * 60_000,
  authRoute: 5 * 60_000,
} as const;
