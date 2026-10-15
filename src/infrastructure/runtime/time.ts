/**
 * @module
 * The one place "a day in milliseconds" is spelled. Retention windows, cooldowns and lifetimes
 * across the codebase are written in terms of it, so a window reads as `7 * DAY_MS`.
 */

/** One day, in milliseconds. */
export const DAY_MS = 24 * 60 * 60 * 1000;
