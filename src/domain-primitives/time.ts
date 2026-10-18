/**
 * @module
 * The one place "a day in milliseconds" is spelled. Retention windows, cooldowns and lifetimes
 * across the codebase are written in terms of it, so a window reads as `7 * DAY_MS`. It lives here,
 * below every tier, so `domain/` files can count whole UTC days with it as well.
 */

/** One day, in milliseconds. */
export const DAY_MS = 24 * 60 * 60 * 1000;
