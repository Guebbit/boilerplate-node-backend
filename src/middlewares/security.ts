import { rateLimit } from 'express-rate-limit';

/**
 * Default window and per-IP budget, used when the `NODE_RATE_LIMIT_*` variables are unset.
 *
 * 100 requests per MINUTE — the conventional shape for a public API (GitHub allows ~83/min,
 * Twitter 60/min, most gateway defaults sit at 60-120/min).
 *
 * Two things changed from the previous 100-per-15-minutes:
 *
 *   - The budget was a session limit, not a rate limit. A single-page app spends 5-15 requests
 *     rendering one page, and a full pass of the frontend's live e2e suite issues ~150, peaking
 *     at 52 in a minute (measured, not estimated). An ordinary browsing session tripped it, and
 *     a limit a legitimate user reaches is worse than none: the 429 lands on them and reads as
 *     the app being broken, while an attacker just rotates IPs.
 *   - The window was too long to recover from. Exhausting a 15-minute budget in the first two
 *     minutes locks the user out for the remaining thirteen. A one-minute window makes the limit
 *     a brake on burst rate, which is what it is for, rather than a quota.
 *
 * The test suites raise the budget by 10x — see `tests/helpers/setup.ts`.
 */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const DEFAULT_RATE_LIMIT_MAX = 100;

/*
 * Global IP-based rate limiter.
 * Configurable via NODE_RATE_LIMIT_WINDOW_MS and NODE_RATE_LIMIT_MAX env vars.
 * Adds standard RateLimit headers (draft-7) and rejects excess requests with HTTP 429.
 */
export const rateLimiter = rateLimit({
    windowMs: Number(process.env.NODE_RATE_LIMIT_WINDOW_MS) || DEFAULT_RATE_LIMIT_WINDOW_MS,
    limit: Number(process.env.NODE_RATE_LIMIT_MAX) || DEFAULT_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

/**
 * Attempts per IP per window against the credential endpoints. Deliberately a small fraction of
 * the global budget.
 */
export const DEFAULT_AUTH_RATE_LIMIT_MAX = 10;

/**
 * Rate limiter for endpoints that accept credentials or mint tokens.
 *
 * The global limiter is sized for browsing — a page of products costs several requests, so its
 * budget has to be generous. Applied to `POST /account/login` that generosity is a hundred
 * password guesses a minute from one address, and an attacker with a small credential list needs
 * no more than that. Worse, the two share a bucket: an attacker's guesses and a real user's page
 * views spend the same allowance, so raising the global limit for legitimate traffic silently
 * raises the guessing rate too.
 *
 * A separate, much smaller budget decouples them. It is mounted per route rather than globally,
 * so browsing never consumes it and a locked-out guesser can still read the catalogue.
 *
 * `skipSuccessfulRequests` is on: a user who signs in correctly has not spent anything, so a
 * shared address (an office, a school, CGNAT) does not lock its own users out for succeeding.
 * Only failures count, which is exactly the signal worth limiting.
 */
export const authRateLimiter = rateLimit({
    windowMs: Number(process.env.NODE_RATE_LIMIT_WINDOW_MS) || DEFAULT_RATE_LIMIT_WINDOW_MS,
    limit: Number(process.env.NODE_AUTH_RATE_LIMIT_MAX) || DEFAULT_AUTH_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});
