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

/**
 * Each tier's env var and the number of seconds used when it is unset.
 *
 * The fallbacks exist so an unset variable cannot mean a TTL of zero, which would expire every
 * token the instant it is signed — a deployment that never sets these still issues usable ones.
 */
const TOKEN_EXPIRY: Record<RefreshTokenExpiryTime | 'default', readonly [string, number]> = {
    [RefreshTokenExpiryTime.SHORT]: ['NODE_TOKEN_REFRESH_TIME_SHORT', 604_800],
    [RefreshTokenExpiryTime.MEDIUM]: ['NODE_TOKEN_REFRESH_TIME_MEDIUM', 2_592_000],
    [RefreshTokenExpiryTime.LONG]: ['NODE_TOKEN_REFRESH_TIME_LONG', 31_536_000],
    default: ['NODE_TOKEN_ACCESS_TIME', 600]
};

/**
 * Expiry time in seconds for the given token duration tier.
 * Falls back to `NODE_TOKEN_ACCESS_TIME` when no tier is given.
 *
 * @param remember - optional tier (short/medium/long)
 * @returns seconds as integer, the tier's default if the env var is unset
 */
export const getExpiryTime = (remember?: RefreshTokenExpiryTime) => {
    const [environmentKey, fallback] = TOKEN_EXPIRY[remember ?? 'default'];
    return environmentNumber(environmentKey, fallback);
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
 * Access token TTL in seconds. The named entry point for the tierless case {@link getExpiryTime}
 * already covers, so the variable and its default are declared once.
 *
 * @returns seconds as integer, 600 if `NODE_TOKEN_ACCESS_TIME` is unset
 */
export const getAccessTokenTTL = () => getExpiryTime();

/**
 * The key every second factor's stored material is protected with — see `two-factor/`. It
 * encrypts a device secret and keys the HMAC of a delivered code.
 *
 * Unlike the JWT secrets above, this one is versioned: `two-factor/totp.ts` prefixes every
 * ciphertext with the version this returns, so a future key rotation can decrypt old rows with
 * their own key while signing new ones with the new one, instead of a migration that cannot tell
 * which key any given row used.
 */
export const getTotpEncryptionKey = (): { version: string; key: string } => ({
    version: 'v1',
    key: process.env.NODE_TOTP_ENCRYPTION_KEY ?? ''
});

/**
 * How long a just-rotated refresh token is still honoured. Long
 * enough that two requests firing within the same page-load race (two tabs waking together, an
 * interceptor retrying) both land inside it; short enough that a token replayed well after its
 * rotation reads as what it is. Milliseconds, since it is compared against a `Date` difference,
 * never signed into a token.
 *
 * @returns milliseconds, 10000 (10s) if `NODE_TOKEN_ROTATION_GRACE_MS` is unset
 */
export const getRotationGraceMilliseconds = () =>
    environmentNumber('NODE_TOKEN_ROTATION_GRACE_MS', 10_000);
