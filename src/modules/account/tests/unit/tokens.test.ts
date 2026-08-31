/**
 * @module
 * Token configuration — `src/modules/account/tokens.ts`.
 *
 * Pure env-var parsing, but every value controls a JWT lifetime or signing secret — a tier that
 * reads the wrong variable produces sessions too long (security) or too short (support), and
 * neither shows up as a failing request elsewhere. Assertions are derived from the module's
 * documented contract: each tier reads its own env var, an unspecified tier falls back to
 * `NODE_TOKEN_ACCESS_TIME`, values are seconds-as-integer (0 if unset), the millisecond helper is
 * the second helper × 1000, and secrets fall back to `''` rather than `undefined`.
 */

import {
    RefreshTokenExpiryTime,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getAccessTokenSecret,
    getRefreshTokenSecret,
    getAccessTokenTTL
} from '@modules/account/session/config';

/**
 * Every env var this module reads. Cleared before each test so a value leaking in from the
 * ambient environment (or from `tests/support/setup.ts`) can never make an assertion pass.
 */
const TOKEN_ENV_KEYS = [
    'NODE_TOKEN_REFRESH_TIME_SHORT',
    'NODE_TOKEN_REFRESH_TIME_MEDIUM',
    'NODE_TOKEN_REFRESH_TIME_LONG',
    'NODE_TOKEN_ACCESS_TIME',
    'NODE_TOKEN_ACCESS',
    'NODE_TOKEN_REFRESH'
] as const;

const originalEnvironment: Record<string, string | undefined> = {};

beforeEach(() => {
    for (const key of TOKEN_ENV_KEYS) {
        originalEnvironment[key] = process.env[key];
        delete process.env[key];
    }
});

afterEach(() => {
    for (const key of TOKEN_ENV_KEYS) {
        if (originalEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnvironment[key];
    }
});

describe('getExpiryTime', () => {
    it('reads a distinct env var per tier', () => {
        // Distinct values on purpose: if two tiers were wired to the same variable, or two
        // entries of the map were swapped, identical values would hide it.
        process.env.NODE_TOKEN_REFRESH_TIME_SHORT = '3600';
        process.env.NODE_TOKEN_REFRESH_TIME_MEDIUM = '86400';
        process.env.NODE_TOKEN_REFRESH_TIME_LONG = '2592000';

        expect(getExpiryTime(RefreshTokenExpiryTime.SHORT)).toBe(3600);
        expect(getExpiryTime(RefreshTokenExpiryTime.MEDIUM)).toBe(86_400);
        expect(getExpiryTime(RefreshTokenExpiryTime.LONG)).toBe(2_592_000);
    });

    it('falls back to the access-token variable when no tier is given', () => {
        process.env.NODE_TOKEN_ACCESS_TIME = '900';
        // Set the tiers too: the no-arg call must ignore them entirely.
        process.env.NODE_TOKEN_REFRESH_TIME_SHORT = '3600';

        expect(getExpiryTime()).toBe(900);
    });

    it('returns 0 when the variable is unset', () => {
        expect(getExpiryTime()).toBe(0);
        expect(getExpiryTime(RefreshTokenExpiryTime.LONG)).toBe(0);
    });

    it('returns 0 for an empty variable rather than NaN', () => {
        // `Number.parseInt('')` is NaN, which would flow into `expiresIn` and produce a token
        // jsonwebtoken rejects. The documented answer for "no usable value" is 0.
        process.env.NODE_TOKEN_ACCESS_TIME = '';

        expect(getExpiryTime()).toBe(0);
    });

    it('parses in base 10, so a zero-padded value is not read as octal', () => {
        process.env.NODE_TOKEN_ACCESS_TIME = '0900';

        expect(getExpiryTime()).toBe(900);
    });
});

describe('getExpiryTimeMilliseconds', () => {
    it('is the seconds value scaled by exactly 1000', () => {
        process.env.NODE_TOKEN_REFRESH_TIME_MEDIUM = '86400';

        expect(getExpiryTimeMilliseconds(RefreshTokenExpiryTime.MEDIUM)).toBe(86_400_000);
    });

    it('honours the same tier routing as getExpiryTime', () => {
        process.env.NODE_TOKEN_REFRESH_TIME_SHORT = '60';
        process.env.NODE_TOKEN_ACCESS_TIME = '900';

        expect(getExpiryTimeMilliseconds(RefreshTokenExpiryTime.SHORT)).toBe(60_000);
        expect(getExpiryTimeMilliseconds()).toBe(900_000);
    });

    it('stays 0 (not NaN) when the variable is unset', () => {
        // A NaN maxAge on a cookie is silently dropped by Express, producing a session cookie
        // instead of the intended persistent one — a bug with no error attached to it.
        expect(getExpiryTimeMilliseconds()).toBe(0);
    });
});

describe('token secrets', () => {
    it('returns the configured access and refresh secrets from separate variables', () => {
        process.env.NODE_TOKEN_ACCESS = 'access-secret';
        process.env.NODE_TOKEN_REFRESH = 'refresh-secret';

        expect(getAccessTokenSecret()).toBe('access-secret');
        expect(getRefreshTokenSecret()).toBe('refresh-secret');
    });

    it('falls back to an empty string when unset', () => {
        // `jsonwebtoken` throws on an `undefined` secret but accepts ''. Neither is good, but ''
        // is the documented shape and keeps the failure inside the signing call.
        expect(getAccessTokenSecret()).toBe('');
        expect(getRefreshTokenSecret()).toBe('');
    });
});

describe('getAccessTokenTTL', () => {
    it('reads NODE_TOKEN_ACCESS_TIME', () => {
        process.env.NODE_TOKEN_ACCESS_TIME = '900';

        expect(getAccessTokenTTL()).toBe(900);
    });

    it('returns 0 when unset', () => {
        expect(getAccessTokenTTL()).toBe(0);
    });

    it('does not read any refresh tier variable', () => {
        // Guards the access/refresh split: an access token inheriting a 30-day refresh TTL is
        // exactly the mistake this separation exists to prevent.
        process.env.NODE_TOKEN_REFRESH_TIME_LONG = '2592000';

        expect(getAccessTokenTTL()).toBe(0);
    });
});
