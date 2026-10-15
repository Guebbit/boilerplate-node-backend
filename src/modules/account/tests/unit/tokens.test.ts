/**
 * @module
 * Token configuration (`session/config.ts`). Pure env-var parsing, but every value controls a
 * JWT lifetime or signing secret — a tier reading the wrong variable produces sessions too long
 * (security) or too short (support), and neither shows up as a failing request elsewhere.
 * Assertions follow the documented contract: each tier reads its own env var, falling back to
 * `NODE_TOKEN_ACCESS_TIME`, seconds-as-integer, and each signing ring defaulting to the empty ring,
 * never `undefined` (the boot gate refuses an unset one outside test).
 */

import {
    RefreshTokenExpiryTime,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getAccessExpiryTime,
    getCookieMaxAgeMilliseconds,
    toRememberTier,
    getAccessTokenRing,
    getRefreshTokenRing,
    getSessionMode,
    sessionConfig
} from '@modules/account/session/config';
import { assertConfigIn } from '@infrastructure/config/define';
import { setEnvironment, withoutEnvironmentInThisFile } from '@tests/environment';

/**
 * Every env var this module reads. Cleared before each test so a value leaking in from the
 * ambient environment (or from `tests/support/setup-environment.ts`) can never make an assertion pass.
 */
const TOKEN_ENV_KEYS = [
    'NODE_SESSION_MODE',
    'NODE_SESSION_TIME_SHORT',
    'NODE_SESSION_TIME_MEDIUM',
    'NODE_SESSION_TIME_LONG',
    'NODE_TOKEN_ACCESS_TIME',
    'NODE_TOKEN_ACCESS',
    'NODE_TOKEN_REFRESH',
    'NODE_TOKEN_ROTATION_GRACE_MS',
    'NODE_TOKEN_REUSE_WINDOW_MS'
] as const;

withoutEnvironmentInThisFile(TOKEN_ENV_KEYS);

describe('getExpiryTime', () => {
    it('reads a distinct env var per tier', () => {
        // Distinct values on purpose: if two tiers were wired to the same variable, or two
        // entries of the map were swapped, identical values would hide it.
        setEnvironment({ NODE_SESSION_TIME_SHORT: '3600' });
        setEnvironment({ NODE_SESSION_TIME_MEDIUM: '86400' });
        setEnvironment({ NODE_SESSION_TIME_LONG: '2592000' });

        expect(getExpiryTime(RefreshTokenExpiryTime.SHORT)).toBe(3600);
        expect(getExpiryTime(RefreshTokenExpiryTime.MEDIUM)).toBe(86_400);
        expect(getExpiryTime(RefreshTokenExpiryTime.LONG)).toBe(2_592_000);
    });

    it('uses the short tier when no tier is given (a browser-session login)', () => {
        setEnvironment({ NODE_SESSION_TIME_SHORT: '3600' });
        // The access-token variable must be ignored entirely: a session cookie still needs a
        // real server-side limit, and 10 minutes is not it.
        setEnvironment({ NODE_TOKEN_ACCESS_TIME: '900' });

        expect(getExpiryTime()).toBe(3600);
    });

    it('falls back to the tier default when the variable is unset', () => {
        expect(getExpiryTime()).toBe(86_400);
        expect(getExpiryTime(RefreshTokenExpiryTime.LONG)).toBe(2_592_000);
    });

    it('falls back for an empty variable rather than returning NaN', () => {
        // `Number.parseInt('')` is NaN, which would flow into `expiresIn` and produce a token
        // jose rejects. An unusable value resolves to the tier default, same as an absent one.
        setEnvironment({ NODE_SESSION_TIME_SHORT: '' });

        expect(getExpiryTime()).toBe(86_400);
    });

    it('parses in base 10, so a zero-padded value is not read as octal', () => {
        setEnvironment({ NODE_SESSION_TIME_SHORT: '0900' });

        expect(getExpiryTime()).toBe(900);
    });
});

describe('getExpiryTimeMilliseconds', () => {
    it('is the seconds value scaled by exactly 1000', () => {
        setEnvironment({ NODE_SESSION_TIME_MEDIUM: '86400' });

        expect(getExpiryTimeMilliseconds(RefreshTokenExpiryTime.MEDIUM)).toBe(86_400_000);
    });

    it('honours the same tier routing as getExpiryTime', () => {
        setEnvironment({ NODE_SESSION_TIME_SHORT: '60' });
        setEnvironment({ NODE_SESSION_TIME_MEDIUM: '120' });

        expect(getExpiryTimeMilliseconds(RefreshTokenExpiryTime.SHORT)).toBe(60_000);
        expect(getExpiryTimeMilliseconds(RefreshTokenExpiryTime.MEDIUM)).toBe(120_000);
        expect(getExpiryTimeMilliseconds()).toBe(60_000);
    });

    it('stays a real number (not NaN) when the variable is unset', () => {
        // A NaN maxAge on a cookie is silently dropped by Express, producing a session cookie
        // instead of the intended persistent one — a bug with no error attached to it.
        expect(getExpiryTimeMilliseconds()).toBe(86_400_000);
    });
});

describe('token signing rings', () => {
    it('returns a ring of one from a plain, comma-free variable', () => {
        // Unrotated is the common case, and it must read exactly as a single secret always has.
        setEnvironment({ NODE_TOKEN_ACCESS: 'access-secret' });
        setEnvironment({ NODE_TOKEN_REFRESH: 'refresh-secret' });

        expect(getAccessTokenRing()).toEqual(['access-secret']);
        expect(getRefreshTokenRing()).toEqual(['refresh-secret']);
    });

    it('splits a comma-separated variable into an ordered ring, newest first', () => {
        setEnvironment({ NODE_TOKEN_ACCESS: 'new-access-secret,old-access-secret' });

        expect(getAccessTokenRing()).toEqual(['new-access-secret', 'old-access-secret']);
    });

    it('is the empty ring when unset, never undefined', () => {
        // The boot gate refuses an unset ring outside test; this is the shape a test run sees.
        expect(getAccessTokenRing()).toEqual([]);
        expect(getRefreshTokenRing()).toEqual([]);
    });
});

describe('the access-token TTL', () => {
    it('reads NODE_TOKEN_ACCESS_TIME', () => {
        setEnvironment({ NODE_TOKEN_ACCESS_TIME: '900' });

        expect(getAccessExpiryTime()).toBe(900);
    });

    it('falls back to ten minutes when unset', () => {
        // Not 0: a zero TTL signs tokens that are already expired, and an operator who never set
        // the variable gets a working login rather than a session that ends on arrival.
        expect(getAccessExpiryTime()).toBe(600);
    });

    it('falls back for an empty variable rather than returning NaN', () => {
        setEnvironment({ NODE_TOKEN_ACCESS_TIME: '' });

        expect(getAccessExpiryTime()).toBe(600);
    });

    it('does not read any refresh tier variable', () => {
        // Guards the access/refresh split: an access token inheriting a 7-day refresh TTL is
        // exactly the mistake the browser-session fallback invites.
        setEnvironment({ NODE_SESSION_TIME_SHORT: '3600' });
        setEnvironment({ NODE_SESSION_TIME_LONG: '2592000' });

        expect(getAccessExpiryTime()).toBe(600);
    });
});

describe('getCookieMaxAgeMilliseconds', () => {
    it('is the tier in milliseconds when a tier was ticked', () => {
        setEnvironment({ NODE_SESSION_TIME_MEDIUM: '86400' });

        expect(getCookieMaxAgeMilliseconds(RefreshTokenExpiryTime.MEDIUM)).toBe(86_400_000);
    });

    it('is undefined (a browser-session cookie) when nothing was ticked', () => {
        expect(getCookieMaxAgeMilliseconds()).toBeUndefined();
    });
});

describe('toRememberTier', () => {
    it('maps each wire literal to its enum member', () => {
        expect(toRememberTier('short')).toBe(RefreshTokenExpiryTime.SHORT);
        expect(toRememberTier('medium')).toBe(RefreshTokenExpiryTime.MEDIUM);
        expect(toRememberTier('long')).toBe(RefreshTokenExpiryTime.LONG);
    });

    it('is undefined when the field is omitted', () => {
        expect(toRememberTier()).toBeUndefined();
    });
});

/**
 * What the slice's boot check says about a pair of windows — the one relationship between them
 * that must hold, or refresh-token reuse can never be detected.
 *
 * @param grace - `NODE_TOKEN_ROTATION_GRACE_MS`, unset when omitted
 * @param reuse - `NODE_TOKEN_REUSE_WINDOW_MS`, unset when omitted
 */
const windowProblems = (grace?: string, reuse?: string): string[] =>
    sessionConfig.slice.inspect({
        NODE_ENV: 'production',
        NODE_TOKEN_ROTATION_GRACE_MS: grace,
        NODE_TOKEN_REUSE_WINDOW_MS: reuse
    }).checks;

describe('the token windows check', () => {
    it('reports no problem when the reuse window comfortably outlives the grace window', () => {
        expect(windowProblems('10000', '86400000')).toEqual([]);
    });

    it('reports no problem on the documented defaults (10s grace, 24h reuse)', () => {
        expect(windowProblems()).toEqual([]);
    });

    it('refuses a reuse window equal to the grace window', () => {
        // Equal, not just smaller: `reuse > grace` is the boot check's own condition, and a token
        // superseded exactly `grace` ago is already past both cutoffs at once -- there is no
        // instant in which a replay reads as reuse rather than an ordinary expired token.
        expect(windowProblems('10000', '10000')).toEqual([
            'NODE_TOKEN_REUSE_WINDOW_MS (10000ms) must exceed NODE_TOKEN_ROTATION_GRACE_MS (10000ms), or refresh-token reuse can never be detected'
        ]);
    });

    it('refuses a reuse window shorter than the grace window', () => {
        expect(windowProblems('86400000', '10000')).toEqual([
            'NODE_TOKEN_REUSE_WINDOW_MS (10000ms) must exceed NODE_TOKEN_ROTATION_GRACE_MS (86400000ms), or refresh-token reuse can never be detected'
        ]);
    });
});

describe('getSessionMode', () => {
    it('is jwt unless the deployment says otherwise', () => {
        expect(getSessionMode()).toBe('jwt');
    });

    it.each([
        ['cookie', 'cookie'],
        ['  Cookie ', 'cookie'],
        ['JWT', 'jwt']
    ])('reads %j as %s', (value, expected) => {
        setEnvironment({ NODE_SESSION_MODE: value });

        expect(getSessionMode()).toBe(expected);
    });

    it('refuses a mode it does not know, rather than falling back to one', () => {
        setEnvironment({ NODE_SESSION_MODE: 'sessions' });

        expect(() => getSessionMode()).toThrow(/NODE_SESSION_MODE/);
    });
});

/**
 * The signing rings are what `jwt` mode signs with and `cookie` mode never touches, so a
 * `cookie` deployment must not be made to invent two secrets it will never use — and a `jwt` one
 * must still be refused its placeholders.
 */
describe('the boot gate for the signing rings', () => {
    /** Production-shaped, the slice's other required keys good, the two rings still the placeholders. */
    const placeholders = {
        NODE_ENV: 'production',
        NODE_TOTP_ENCRYPTION_KEY: 'c'.repeat(64),
        NODE_DEVICE_COOKIE_SECRET: 'd'.repeat(64),
        NODE_TOKEN_ACCESS: 'your-access-token-secret-here',
        NODE_TOKEN_REFRESH: 'your-refresh-token-secret-here'
    };

    it('refuses the placeholders in jwt mode, with the mode named or not', () => {
        expect(() => assertConfigIn([sessionConfig.slice], placeholders)).toThrow(
            /NODE_TOKEN_ACCESS, NODE_TOKEN_REFRESH/
        );
        expect(() =>
            assertConfigIn([sessionConfig.slice], { ...placeholders, NODE_SESSION_MODE: 'jwt' })
        ).toThrow(/NODE_TOKEN_ACCESS/);
    });

    it('does not ask a cookie deployment for them', () => {
        expect(() =>
            assertConfigIn([sessionConfig.slice], { ...placeholders, NODE_SESSION_MODE: 'cookie' })
        ).not.toThrow();
        expect(() =>
            assertConfigIn([sessionConfig.slice], {
                ...placeholders,
                NODE_TOKEN_ACCESS: undefined,
                NODE_TOKEN_REFRESH: undefined,
                NODE_SESSION_MODE: 'cookie'
            })
        ).not.toThrow();
    });

    it('reads the selector the way its own field does: trimmed, any case', () => {
        expect(() =>
            assertConfigIn([sessionConfig.slice], {
                ...placeholders,
                NODE_SESSION_MODE: ' COOKIE '
            })
        ).not.toThrow();
    });

    it('does not apply the reuse-window check to a mode with no rotation', () => {
        const backwards = {
            NODE_TOKEN_ROTATION_GRACE_MS: '5000',
            NODE_TOKEN_REUSE_WINDOW_MS: '1000'
        };

        expect(() =>
            assertConfigIn([sessionConfig.slice], {
                ...placeholders,
                NODE_TOKEN_ACCESS: 'a'.repeat(64),
                NODE_TOKEN_REFRESH: 'b'.repeat(64),
                ...backwards
            })
        ).toThrow(/reuse can never be detected/);
        expect(() =>
            assertConfigIn([sessionConfig.slice], {
                ...placeholders,
                NODE_SESSION_MODE: 'cookie',
                ...backwards
            })
        ).not.toThrow();
    });
});
