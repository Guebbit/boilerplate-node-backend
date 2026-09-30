/**
 * @module
 * Token configuration — parses and exposes token expiry settings from env. Named `config.ts`
 * rather than `tokens.ts` (its name at the module root) because it holds no token and issues
 * none: it just reads how long each tier lives, which `./jwt` signs against and `./cookies` sets
 * `maxAge` from. See docs/modules/account-sessions.md.
 */

import { environmentNumber } from '@infrastructure/runtime/environment';
import {
    parseVersionedKeyRing,
    type VersionedKey
} from '@infrastructure/security/versioned-secret';

/** The "remember me" tiers a refresh token may be issued under — see the table in the doc above. */
export enum RefreshTokenExpiryTime {
    SHORT = 'short',
    MEDIUM = 'medium',
    LONG = 'long'
}

/**
 * Narrows the contract's wire literal (`'short' | 'medium' | 'long'`) to the enum the session
 * code speaks. The generated request types carry plain literals, which a string enum won't accept.
 *
 * @param wire - the `remember` field of a request body, already schema-validated
 * @returns the matching tier, `undefined` when the box was unticked
 */
export const toRememberTier = (
    wire?: `${RefreshTokenExpiryTime}`
): RefreshTokenExpiryTime | undefined =>
    Object.values(RefreshTokenExpiryTime).find((tier) => tier === wire);

/**
 * Each tier's env var and the number of seconds used when it is unset.
 *
 * The fallbacks exist so an unset variable cannot mean a TTL of zero, which would expire every
 * token the instant it is signed — a deployment that never sets these still issues usable ones.
 */
const TOKEN_EXPIRY: Record<RefreshTokenExpiryTime, readonly [string, number]> = {
    [RefreshTokenExpiryTime.SHORT]: ['NODE_TOKEN_REFRESH_TIME_SHORT', 604_800],
    [RefreshTokenExpiryTime.MEDIUM]: ['NODE_TOKEN_REFRESH_TIME_MEDIUM', 2_592_000],
    [RefreshTokenExpiryTime.LONG]: ['NODE_TOKEN_REFRESH_TIME_LONG', 31_536_000]
};

/**
 * Server-side lifetime in seconds of a REFRESH token.
 *
 * No tier means the "remember me" box was left unticked (or there was none): the cookie is a
 * browser-session one, but the token still needs a real limit — browsers restore session cookies,
 * so the server TTL is the actual bound. That limit is the `short` tier.
 *
 * @param remember - the ticked tier, absent for a browser-session login
 * @returns seconds as integer, the tier's default if the env var is unset
 */
export const getExpiryTime = (remember?: RefreshTokenExpiryTime) => {
    const [environmentKey, fallback] = TOKEN_EXPIRY[remember ?? RefreshTokenExpiryTime.SHORT];
    return environmentNumber(environmentKey, fallback);
};

/**
 * Millisecond wrapper around {@link getExpiryTime}.
 *
 * @param remember - the ticked tier, absent for a browser-session login
 * @returns expiry in ms
 */
export const getExpiryTimeMilliseconds = (remember?: RefreshTokenExpiryTime) =>
    getExpiryTime(remember) * 1000;

/**
 * Lifetime in seconds of an ACCESS token. Deliberately separate from {@link getExpiryTime}: an
 * access token is short-lived whatever the session tier, so it must never inherit the refresh
 * fallback.
 *
 * @returns seconds as integer, 600 if `NODE_TOKEN_ACCESS_TIME` is unset
 */
export const getAccessExpiryTime = () => environmentNumber('NODE_TOKEN_ACCESS_TIME', 600);

/**
 * The refresh cookie's `maxAge` for a login, or `undefined` for a browser-session cookie.
 *
 * @param remember - the ticked tier, absent when the box was unticked
 * @returns milliseconds when the cookie must persist, otherwise `undefined` (no `Max-Age`)
 */
export const getCookieMaxAgeMilliseconds = (remember?: RefreshTokenExpiryTime) =>
    remember ? getExpiryTimeMilliseconds(remember) : undefined;

/**
 * Splits a ring env var on commas, newest first. A ring of one is just that value with no comma,
 * so an operator who never rotates writes exactly what they write today.
 */
const parseKeyRing = (raw: string | undefined): string[] => (raw ?? '').split(',');

/**
 * The access-token signing/verification ring, newest first. `./jwt` signs with `ring[0]` and
 * verifies against whichever member a token's `kid` names — see `./key-ring`.
 */
export const getAccessTokenRing = (): string[] => parseKeyRing(process.env.NODE_TOKEN_ACCESS);

/** The refresh-token ring. Same shape and rotation contract as {@link getAccessTokenRing}. */
export const getRefreshTokenRing = (): string[] => parseKeyRing(process.env.NODE_TOKEN_REFRESH);

/**
 * The key ring every second factor's stored material is protected with — see `two-factor/`. It
 * encrypts a device secret and keys the HMAC of a delivered code.
 *
 * Unlike the JWT secrets above, each entry is versioned: `two-factor/totp.ts` prefixes every
 * ciphertext with the version of the ring entry (`ring[0]` at encryption time) it was written
 * under, so a future key rotation can decrypt old rows against their own entry while signing new
 * ones with the new one, instead of a migration that cannot tell which key any given row used. See
 * {@link parseVersionedKeyRing} for the env var's wire format.
 */
export const getTotpEncryptionKeyRing = (): VersionedKey[] =>
    parseVersionedKeyRing(process.env.NODE_TOTP_ENCRYPTION_KEY);

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

/**
 * How long a rotated-away refresh token is REMEMBERED, so replaying it still reads as theft.
 *
 * Distinct from the grace window above: grace answers "is this replay a benign race?" and is
 * deliberately tiny; this answers "do we still recognise this token at all?"
 *
 * Default: a day. A stolen refresh token is a wasting asset — replayed within minutes or hours,
 *          not next week.
 * Cost:    an active client rotates about every access-token lifetime
 *          (`NODE_TOKEN_ACCESS_TIME`, 600s), so 24h is roughly 144 retained entries per session.
 *          A full refresh-token lifetime instead would reach ~52,500 on the one-year tier,
 *          against Mongo's 16 MB document ceiling.
 * Past it: an ordinary 401, no revocation — a real limit, chosen rather than stumbled into.
 *
 * @returns milliseconds, 86400000 (24h) if `NODE_TOKEN_REUSE_WINDOW_MS` is unset
 */
export const getReuseDetectionWindowMilliseconds = () =>
    environmentNumber('NODE_TOKEN_REUSE_WINDOW_MS', 86_400_000);

/**
 * The one relationship between them that must hold: a token has to outlive the grace window by
 * some margin, or there is no interval in which reuse is detectable at all.
 *
 * Checked at BOOT rather than at the read, because the failure is silent by nature — everything
 * keeps working, every replay just answers a clean 401, and the defence is simply gone. That is
 * precisely the shape of bug this check exists to refuse.
 *
 * @returns the problems `account`'s manifest reports, empty when the two are ordered correctly
 */
export const invalidTokenWindows = (): string[] => {
    const grace = getRotationGraceMilliseconds();
    const reuse = getReuseDetectionWindowMilliseconds();

    return reuse > grace
        ? []
        : [
              `NODE_TOKEN_REUSE_WINDOW_MS (${reuse}ms) must exceed ` +
                  `NODE_TOKEN_ROTATION_GRACE_MS (${grace}ms), or refresh-token reuse can never be detected`
          ];
};
