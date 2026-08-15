/**
 * Auth cookies — `src/modules/account/cookies.ts`.
 *
 * Four one-liners that together decide whether a session can be stolen. The flags are the whole
 * substance of the module, so they are asserted individually rather than as one blob:
 *
 *   - `jwt` (the refresh token) must be **httpOnly** — it is the credential, and script access
 *     to it is the difference between an XSS bug and an account takeover.
 *   - `isAuth` must NOT be httpOnly — it is a UI hint the frontend has to read, and it carries
 *     no secret. Getting these two backwards breaks either security or the login UI.
 *   - `secure` must track production, so local HTTP development still works while deployed
 *     traffic never sends the credential in the clear.
 *   - clearing must repeat the same flags: browsers only drop a cookie when name/path/flags
 *     match, so a mismatched `clearCookie` leaves the session cookie in place — a logout that
 *     silently does nothing.
 */

import type { Response } from 'express';
import {
    createRefreshCookie,
    destroyRefreshCookie,
    createLoggedCookie,
    destroyLoggedCookie
} from '@modules/account/cookies';
import { RefreshTokenExpiryTime } from '@modules/account/tokens';

/** Captures the (name, value, options) triples the module hands to Express. */
const makeResponse = () =>
    ({
        cookie: jest.fn(),
        clearCookie: jest.fn()
    }) as unknown as Response & {
        cookie: jest.Mock;
        clearCookie: jest.Mock;
    };

const originalNodeEnvironment = process.env.NODE_ENV;
const originalShort = process.env.NODE_TOKEN_REFRESH_TIME_SHORT;
const originalAccess = process.env.NODE_TOKEN_ACCESS_TIME;

beforeEach(() => {
    // Real values, so the maxAge assertions exercise the actual token-config wiring rather than
    // a mock that would agree with anything.
    process.env.NODE_TOKEN_REFRESH_TIME_SHORT = '3600';
    process.env.NODE_TOKEN_ACCESS_TIME = '900';
});

afterEach(() => {
    process.env.NODE_ENV = originalNodeEnvironment;
    if (originalShort === undefined) delete process.env.NODE_TOKEN_REFRESH_TIME_SHORT;
    else process.env.NODE_TOKEN_REFRESH_TIME_SHORT = originalShort;
    if (originalAccess === undefined) delete process.env.NODE_TOKEN_ACCESS_TIME;
    else process.env.NODE_TOKEN_ACCESS_TIME = originalAccess;
});

describe('createRefreshCookie', () => {
    it('sets the jwt cookie httpOnly, lax and site-wide', () => {
        const response = makeResponse();

        createRefreshCookie(response, 'signed.jwt.value');

        const [name, value, options] = response.cookie.mock.calls[0];
        expect(name).toBe('jwt');
        expect(value).toBe('signed.jwt.value');
        // httpOnly is the load-bearing flag: this cookie is the credential.
        expect(options.httpOnly).toBe(true);
        expect(options.sameSite).toBe('lax');
        expect(options.path).toBe('/');
    });

    it('marks the cookie secure in production', () => {
        process.env.NODE_ENV = 'production';
        const response = makeResponse();

        createRefreshCookie(response, 'token');

        expect(response.cookie.mock.calls[0][2].secure).toBe(true);
    });

    it('leaves the cookie non-secure outside production, so local HTTP still works', () => {
        process.env.NODE_ENV = 'development';
        const response = makeResponse();

        createRefreshCookie(response, 'token');

        expect(response.cookie.mock.calls[0][2].secure).toBe(false);
    });

    it('derives maxAge from the requested expiry tier', () => {
        const response = makeResponse();

        createRefreshCookie(response, 'token', RefreshTokenExpiryTime.SHORT);

        // 3600s from NODE_TOKEN_REFRESH_TIME_SHORT, in milliseconds.
        expect(response.cookie.mock.calls[0][2].maxAge).toBe(3_600_000);
    });

    it('falls back to the access-token window when no tier is given', () => {
        const response = makeResponse();

        createRefreshCookie(response, 'token');

        expect(response.cookie.mock.calls[0][2].maxAge).toBe(900_000);
    });
});

describe('destroyRefreshCookie', () => {
    it('clears jwt with the same flags it was set with', () => {
        const response = makeResponse();

        destroyRefreshCookie(response);

        const [name, options] = response.clearCookie.mock.calls[0];
        expect(name).toBe('jwt');
        // A browser drops a cookie only on a matching name/path/flags triple. Any drift here is
        // a logout that appears to succeed and leaves the session alive.
        expect(options).toEqual(
            expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' })
        );
    });

    it('matches the production secure flag when clearing', () => {
        process.env.NODE_ENV = 'production';
        const response = makeResponse();

        destroyRefreshCookie(response);

        expect(response.clearCookie.mock.calls[0][1].secure).toBe(true);
    });
});

describe('createLoggedCookie', () => {
    it('sets a readable isAuth hint rather than a credential', () => {
        const response = makeResponse();

        createLoggedCookie(response, RefreshTokenExpiryTime.SHORT);

        const [name, value, options] = response.cookie.mock.calls[0];
        expect(name).toBe('isAuth');
        expect(value).toBe('true');
        // Deliberately NOT httpOnly: the frontend has to read it. Asserted explicitly so the
        // two cookies can never be "hardened" into each other's role by mistake.
        expect(options.httpOnly).toBeUndefined();
        expect(options.sameSite).toBe('lax');
        expect(options.path).toBe('/');
    });

    it('expires in step with the refresh cookie it describes', () => {
        const response = makeResponse();

        createLoggedCookie(response, RefreshTokenExpiryTime.SHORT);

        // If the hint outlived the credential the UI would show a logged-in state for a session
        // the API has already stopped honouring.
        expect(response.cookie.mock.calls[0][2].maxAge).toBe(3_600_000);
    });
});

describe('destroyLoggedCookie', () => {
    it('clears isAuth on the same path it was set', () => {
        const response = makeResponse();

        destroyLoggedCookie(response);

        expect(response.clearCookie).toHaveBeenCalledWith('isAuth', { path: '/' });
    });
});
