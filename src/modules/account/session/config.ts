/**
 * @module
 * Token configuration — parses and exposes token expiry settings from env. Named `config.ts`
 * rather than `tokens.ts` (its name at the module root) because it holds no token and issues
 * none: it just reads how long each tier lives, which `./jwt` signs against and `./cookies` sets
 * `maxAge` from. See docs/modules/account-sessions.md.
 */

import { environmentNumber } from '@infrastructure/runtime/environment';

/** The "remember me" tiers a refresh token may be issued under — see the table in the doc above. */
export enum RefreshTokenExpiryTime {
    SHORT = 'short',
    MEDIUM = 'medium',
    LONG = 'long'
}

/** Maps each token tier to its corresponding env var name. */
const TOKEN_EXPIRY_ENV: Record<RefreshTokenExpiryTime | 'default', string> = {
    [RefreshTokenExpiryTime.SHORT]: 'NODE_TOKEN_REFRESH_TIME_SHORT',
    [RefreshTokenExpiryTime.MEDIUM]: 'NODE_TOKEN_REFRESH_TIME_MEDIUM',
    [RefreshTokenExpiryTime.LONG]: 'NODE_TOKEN_REFRESH_TIME_LONG',
    default: 'NODE_TOKEN_ACCESS_TIME'
};

/**
 * Expiry time in seconds for the given token duration tier.
 * Falls back to `NODE_TOKEN_ACCESS_TIME` when no tier is given.
 *
 * @param remember - optional tier (short/medium/long)
 * @returns seconds as integer, 0 if env var is unset
 */
export const getExpiryTime = (remember?: RefreshTokenExpiryTime) => {
    const environmentKey = TOKEN_EXPIRY_ENV[remember ?? 'default'];
    return environmentNumber(environmentKey, 0);
};

/**
 * Millisecond wrapper around {@link getExpiryTime}.
 *
 * @param remember - optional tier
 * @returns expiry in ms
 */
export const getExpiryTimeMilliseconds = (remember?: RefreshTokenExpiryTime) =>
    getExpiryTime(remember) * 1000;

/** The secret access tokens are signed and verified with. */
export const getAccessTokenSecret = () => process.env.NODE_TOKEN_ACCESS ?? '';

/** The secret refresh tokens are signed and verified with. */
export const getRefreshTokenSecret = () => process.env.NODE_TOKEN_REFRESH ?? '';

/**
 * Access token TTL in seconds.
 *
 * @returns seconds as integer, 0 if env var is unset
 */
export const getAccessTokenTTL = () => environmentNumber('NODE_TOKEN_ACCESS_TIME', 0);

/**
 * How long a just-rotated refresh token is still honoured — BETTER_SECURITY.md wave 3.2. Long
 * enough that two requests firing within the same page-load race (two tabs waking together, an
 * interceptor retrying) both land inside it; short enough that a token replayed well after its
 * rotation reads as what it is. Milliseconds, since it is compared against a `Date` difference,
 * never signed into a token.
 *
 * @returns milliseconds, 10000 (10s) if `NODE_TOKEN_ROTATION_GRACE_MS` is unset
 */
export const getRotationGraceMilliseconds = () =>
    environmentNumber('NODE_TOKEN_ROTATION_GRACE_MS', 10_000);
