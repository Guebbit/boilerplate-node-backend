/**
 * @module
 * Session configuration — which mode keeps people signed in, and how long each tier lives. Named
 * `config.ts` rather than `tokens.ts` because it holds no token and issues none: it reads policy,
 * which `./jwt` signs against, `./cookie-strategy` stores against and `./cookies` sets `maxAge`
 * from. See docs/modules/account-sessions.md and docs/theory/sessions.md.
 */

import { DAY_MS } from '@domain-primitives/time';
import { defineConfig } from '@infrastructure/config/define';
import {
    choice,
    int,
    keyRing,
    secret,
    text,
    versionedKeyRing
} from '@infrastructure/config/fields';
import type { Environment } from '@infrastructure/config/store';
import { siteConfig } from '@infrastructure/http/config';
import type { VersionedKey } from '@infrastructure/security/versioned-secret';
import { SESSION_MODES, type SessionMode } from '../session-mode';

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
 * Whether the environment selects `cookie` mode — what a `jwt`-only variable's presence rule asks
 * before it applies. Reads the raw selector the way its own `choice` field does: trimmed and
 * lower-cased.
 *
 * @param environment - the environment being judged at boot
 */
const selectsCookieMode = (environment: Environment): boolean =>
    environment.NODE_SESSION_MODE?.trim().toLowerCase() === 'cookie';

/**
 * Session configuration: which mode, how long each session lives, the signing rings, and the
 * windows around refresh-token rotation.
 *
 * Shared by both modes: `NODE_SESSION_MODE` and the three `NODE_SESSION_TIME_*` tiers (a
 * refresh token's life in `jwt` mode, the session row's in `cookie` mode). `jwt` only: the two
 * signing rings, the access lifetime, the rotation windows, and the issuer and audiences — a
 * `cookie` deployment signs nothing, so its rings are not required at boot.
 *
 * The TTL fallbacks exist so an unset variable cannot mean a TTL of zero, which would expire every
 * token the instant it is signed — a deployment that never sets them still issues usable ones.
 *
 * Each ring is an ordered, comma-separated key ring (newest first, see
 * `docs/modules/account-sessions.md`), and its presence rule applies to every comma-separated
 * member, so a rotated-in second entry left as the placeholder still refuses to boot. 16 rather
 * than a stricter minimum: this rejects empty and drastically truncated values without pretending
 * to assess real secret strength, which is an operator's job, not a boot-time character count.
 */
export const sessionConfig = defineConfig({
    name: 'account-sessions',
    shape: {
        NODE_SESSION_MODE: choice(SESSION_MODES, { default: 'jwt' }),
        NODE_SESSION_TIME_SHORT: int({ default: 86_400, min: 1 }),
        NODE_SESSION_TIME_MEDIUM: int({ default: 604_800, min: 1 }),
        NODE_SESSION_TIME_LONG: int({ default: 2_592_000, min: 1 }),
        // Staff only: a shopper's session never idles out. 0 switches the timeout off.
        NODE_SESSION_IDLE_TIME_STAFF: int({ default: 1800, min: 0 }),
        // Staff only: the longest a session lives from sign-in, however busy. 0 switches it off.
        NODE_SESSION_LIFETIME_STAFF: int({ default: 86_400, min: 0 }),
        NODE_TOKEN_ACCESS_TIME: int({ default: 600, min: 1 }),
        NODE_TOKEN_ACCESS: keyRing({
            required: {
                minLength: 16,
                minBytes: 32,
                placeholder: 'your-access-token-secret-here',
                skipWhen: selectsCookieMode
            }
        }),
        NODE_TOKEN_REFRESH: keyRing({
            required: {
                minLength: 16,
                minBytes: 32,
                placeholder: 'your-refresh-token-secret-here',
                skipWhen: selectsCookieMode
            }
        }),
        // A TOTP secret encrypted under the shipped placeholder is recoverable by anyone who has
        // read this repository — same failure shape as the two rings above, same fix.
        NODE_TOTP_ENCRYPTION_KEY: versionedKeyRing({
            required: { minLength: 16, minBytes: 32, placeholder: 'your-totp-encryption-key-here' }
        }),
        // The familiar-device cookie's HMAC key. Unset on a developer machine means no cookie is
        // ever set or honoured; in production, unset or the placeholder refuses to boot.
        NODE_DEVICE_COOKIE_SECRET: secret({
            minLength: 16,
            minBytes: 32,
            placeholder: 'your-device-cookie-secret-here',
            productionOnly: true
        }),
        // Unset derives each from `NODE_URL` — see `getTokenIssuer` and the audience getters.
        NODE_TOKEN_ISSUER: text(),
        NODE_TOKEN_ACCESS_AUDIENCE: text(),
        NODE_TOKEN_REFRESH_AUDIENCE: text(),
        NODE_TOKEN_ROTATION_GRACE_MS: int({ default: 10_000, min: 0 }),
        NODE_TOKEN_REUSE_WINDOW_MS: int({ default: DAY_MS, min: 1 })
    },
    // The one relationship between the two windows that must hold: a token has to outlive the
    // grace window by some margin, or there is no interval in which reuse is detectable at all.
    // Checked at BOOT because the failure is silent by nature: everything keeps working, every
    // replay just answers a clean 401, and the defence is simply gone. Moot in `cookie` mode,
    // which has no rotation to detect reuse of.
    check: (config) =>
        config.NODE_SESSION_MODE === 'cookie' ||
        config.NODE_TOKEN_REUSE_WINDOW_MS > config.NODE_TOKEN_ROTATION_GRACE_MS
            ? []
            : [
                  `NODE_TOKEN_REUSE_WINDOW_MS (${String(config.NODE_TOKEN_REUSE_WINDOW_MS)}ms) must exceed ` +
                      `NODE_TOKEN_ROTATION_GRACE_MS (${String(config.NODE_TOKEN_ROTATION_GRACE_MS)}ms), or refresh-token reuse can never be detected`
              ]
});

/** Each tier's variable. */
const TOKEN_EXPIRY = {
    [RefreshTokenExpiryTime.SHORT]: 'NODE_SESSION_TIME_SHORT',
    [RefreshTokenExpiryTime.MEDIUM]: 'NODE_SESSION_TIME_MEDIUM',
    [RefreshTokenExpiryTime.LONG]: 'NODE_SESSION_TIME_LONG'
} as const satisfies Record<RefreshTokenExpiryTime, string>;

/**
 * Which session mode this deployment runs — `jwt` unless `NODE_SESSION_MODE` says `cookie`.
 *
 * @returns the mode, read per call so a test or a restart that changes it is honoured
 */
export const getSessionMode = (): SessionMode => sessionConfig().NODE_SESSION_MODE;

/**
 * Server-side lifetime in seconds of a session — a refresh token in `jwt` mode, a session row in
 * `cookie` mode.
 *
 * No tier means the "remember me" box was left unticked (or there was none): the cookie is a
 * browser-session one, but the token still needs a real limit — browsers restore session cookies,
 * so the server TTL is the actual bound. That limit is the `short` tier.
 *
 * @param remember - the ticked tier, absent for a browser-session login
 * @returns seconds as integer, the tier's default if the env var is unset
 */
export const getExpiryTime = (remember?: RefreshTokenExpiryTime) =>
    sessionConfig()[TOKEN_EXPIRY[remember ?? RefreshTokenExpiryTime.SHORT]];

/**
 * Millisecond wrapper around {@link getExpiryTime}.
 *
 * @param remember - the ticked tier, absent for a browser-session login
 * @returns expiry in ms
 */
export const getExpiryTimeMilliseconds = (remember?: RefreshTokenExpiryTime) =>
    getExpiryTime(remember) * 1000;

/**
 * How long a staff or admin session may sit without a real request before it ends, in seconds.
 * NIST SP 800-63B AAL2 asks for at most an hour of inactivity; a shopper has no such limit.
 *
 * @returns seconds, `0` when the timeout is off
 */
export const getStaffIdleTimeSeconds = () => sessionConfig().NODE_SESSION_IDLE_TIME_STAFF;

/**
 * The longest a staff or admin session lives from sign-in, in seconds, however busy it is. NIST SP
 * 800-63B AAL2 asks for at most 24 hours; a shopper's session keeps the 1 / 7 / 30-day tiers.
 *
 * @returns seconds, `0` when the cap is off
 */
export const getStaffLifetimeSeconds = () => sessionConfig().NODE_SESSION_LIFETIME_STAFF;

/**
 * Lifetime in seconds of an ACCESS token. Deliberately separate from {@link getExpiryTime}: an
 * access token is short-lived whatever the session tier, so it must never inherit the refresh
 * fallback.
 *
 * @returns seconds as integer, 600 if `NODE_TOKEN_ACCESS_TIME` is unset
 */
export const getAccessExpiryTime = () => sessionConfig().NODE_TOKEN_ACCESS_TIME;

/**
 * The session cookie's `maxAge` for a login, or `undefined` for a browser-session cookie.
 *
 * @param remember - the ticked tier, absent when the box was unticked
 * @returns milliseconds when the cookie must persist, otherwise `undefined` (no `Max-Age`)
 */
export const getCookieMaxAgeMilliseconds = (remember?: RefreshTokenExpiryTime) =>
    remember ? getExpiryTimeMilliseconds(remember) : undefined;

/**
 * The access-token signing/verification ring, newest first. `./jwt` signs with `ring[0]` and
 * verifies against whichever member a token's `kid` names — see `./key-ring`.
 */
export const getAccessTokenRing = (): string[] => sessionConfig().NODE_TOKEN_ACCESS;

/** The refresh-token ring. Same shape and rotation contract as {@link getAccessTokenRing}. */
export const getRefreshTokenRing = (): string[] => sessionConfig().NODE_TOKEN_REFRESH;

/** This deployment's own address with no trailing slash — what the token defaults derive from. */
const ownUrl = (): string => siteConfig().NODE_URL.replace(/\/+$/, '');

/**
 * The `iss` every token is signed with and verified against: `NODE_TOKEN_ISSUER`, else this
 * deployment's own `NODE_URL`. A token another service minted with a shared secret names another
 * issuer, and is refused (RFC 8725 §3.10).
 */
export const getTokenIssuer = (): string => sessionConfig().NODE_TOKEN_ISSUER ?? ownUrl();

/**
 * The `aud` of an ACCESS token: `NODE_TOKEN_ACCESS_AUDIENCE`, else `NODE_URL` — the API itself is
 * the resource server it is meant for.
 */
export const getAccessTokenAudience = (): string =>
    sessionConfig().NODE_TOKEN_ACCESS_AUDIENCE ?? ownUrl();

/**
 * The `aud` of a REFRESH token: `NODE_TOKEN_REFRESH_AUDIENCE`, else `NODE_URL` +
 * `/account/refresh`, the endpoint that redeems it. Distinct from the access audience on purpose, so
 * a token of one kind is refused as the other even if both rings shared a secret.
 */
export const getRefreshTokenAudience = (): string =>
    sessionConfig().NODE_TOKEN_REFRESH_AUDIENCE ?? `${ownUrl()}/account/refresh`;

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
    sessionConfig().NODE_TOTP_ENCRYPTION_KEY;

/**
 * How long a just-rotated refresh token is still honoured. Long
 * enough that two requests firing within the same page-load race (two tabs waking together, an
 * interceptor retrying) both land inside it; short enough that a token replayed well after its
 * rotation reads as what it is. Milliseconds, since it is compared against a `Date` difference,
 * never signed into a token.
 *
 * @returns milliseconds, 10000 (10s) if `NODE_TOKEN_ROTATION_GRACE_MS` is unset
 */
export const getRotationGraceMilliseconds = () => sessionConfig().NODE_TOKEN_ROTATION_GRACE_MS;

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
 *          A full refresh-token lifetime instead would reach ~4,300 on the 30-day tier,
 *          against Mongo's 16 MB document ceiling.
 * Past it: an ordinary 401, no revocation — a real limit, chosen rather than stumbled into.
 *
 * @returns milliseconds, 86400000 (24h) if `NODE_TOKEN_REUSE_WINDOW_MS` is unset
 */
export const getReuseDetectionWindowMilliseconds = () => sessionConfig().NODE_TOKEN_REUSE_WINDOW_MS;
