/**
 * @module
 * The familiar-device cookie (OWASP Authentication Cheat Sheet, "device cookies"): set after a
 * successful login, it lets that browser keep signing in while an attacker's guesses have used up
 * the account's failure budget. Without it, anyone who can spend an account's budget can also lock
 * its owner out (Entra's smart lockout and Okta treat a familiar device differently for the same
 * reason).
 *
 * One cookie, a few accounts: its value is up to five tokens, each an HMAC of one account's
 * normalised email under `NODE_DEVICE_COOKIE_SECRET`. A token proves nothing about a password and
 * names no one; forging one needs the secret. Holding it only skips the PER-ACCOUNT failure budget,
 * never the per-address or per-block ones.
 */

import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { constantTimeEqual } from '@infrastructure/security/constant-time';
import { normalizeEmail } from '@modules/users';
import { readBodyField } from '@infrastructure/http/middlewares/rate-limit';
import { secureCookieOptions } from './cookies';
import { sessionConfig } from './config';

/** The cookie's name. */
export const DEVICE_COOKIE = 'device';

/** How many accounts one browser may be familiar for; the oldest drops first. */
const MAX_TOKENS = 5;

/** How long a device stays familiar: 180 days, renewed by every successful login. */
const DEVICE_COOKIE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/** The separator between tokens: not in base64url, so a token can never contain it. */
const SEPARATOR = '.';

/**
 * The token that vouches for one account on this deployment.
 *
 * @param email - the account's address, normalised first so `Ada@X.com` and `ada@x.com` agree
 * @returns base64url of the HMAC-SHA256, empty when no secret is configured (nothing then verifies)
 */
const tokenFor = (email: string): string => {
    const key = sessionConfig().NODE_DEVICE_COOKIE_SECRET;
    // Node: HMAC-SHA256 keyed by the deployment's own secret. https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
    return key
        ? createHmac('sha256', key)
              .update(`device:${normalizeEmail(email)}`)
              .digest('base64url')
        : '';
};

/**
 * The tokens the request's cookie carries, possibly none. A request whose cookies were never parsed
 * carries none: this runs inside a rate limiter's `skip`, where throwing would turn every login into
 * a 500, and "no cookie" is the fail-closed reading (the budget then applies in full).
 */
const presentedTokens = (request: Request): string[] => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `cookies` is typed always present, but it is absent on an app that never mounted `cookie-parser`
    const cookies = (request.cookies ?? {}) as Record<string, string | undefined>;
    return cookies[DEVICE_COOKIE]?.split(SEPARATOR).filter(Boolean) ?? [];
};

/**
 * The account a request is about, for the cookie's purposes: a signed-in caller's own address, else
 * the address a login body names. Reads the same two places the credential budget's key does.
 *
 * @param request - the incoming request
 */
const subjectOf = (request: Request): string | undefined =>
    request.authContext?.email ?? readBodyField(request, 'email');

/**
 * Whether this browser is familiar for the account the request is about.
 *
 * @param request - the incoming request
 * @returns true when the cookie carries a token that verifies for that account
 */
export const holdsDeviceCookie = (request: Request): boolean => {
    const subject = subjectOf(request);
    const expected = subject ? tokenFor(subject) : '';
    return (
        expected !== '' &&
        presentedTokens(request).some((token) => constantTimeEqual(token, expected))
    );
};

/**
 * Whether the request presents a device cookie that does NOT vouch for the account it names — a
 * forged or stale one. Counted in its own budget so guessing a token is bounded separately from the
 * password it would excuse.
 *
 * @param request - the incoming request
 */
export const presentsFailingDeviceCookie = (request: Request): boolean =>
    presentedTokens(request).length > 0 && !holdsDeviceCookie(request);

/**
 * Mark this browser familiar for `email` — after a login that fully succeeded. Keeps the other
 * accounts' tokens it already held (newest first, five at most), so signing into a second account
 * does not forget the first.
 *
 * @param request - the login request, carrying whatever cookie the browser already held
 * @param response - where the cookie is set
 * @param email - the account that just signed in
 */
export const rememberDevice = (request: Request, response: Response, email: string): void => {
    const token = tokenFor(email);
    if (!token) return;

    const tokens = [token, ...presentedTokens(request).filter((held) => held !== token)].slice(
        0,
        MAX_TOKENS
    );
    // Express: a persistent, httpOnly cookie. https://expressjs.com/en/api.html#res.cookie
    response.cookie(DEVICE_COOKIE, tokens.join(SEPARATOR), {
        ...secureCookieOptions(),
        maxAge: DEVICE_COOKIE_MAX_AGE_MS
    });
};
