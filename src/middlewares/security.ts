import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { rejectResponse } from '@core/http/response';
import { logger } from '@core/adapters/logger';

/**
 * Default window and per-IP budget, used when the `NODE_RATE_LIMIT_*` variables are unset.
 *
 * 100 requests per MINUTE — the conventional shape for a public API (GitHub allows ~83/min,
 * Twitter 60/min, most gateway defaults sit at 60-120/min).
 *
 * Why per minute and not per quarter-hour: a single-page app spends 5-15 requests rendering one
 * page, and a full pass of the frontend's live e2e suite issues ~150, peaking at 52 in a minute
 * (measured, not estimated). Spread over a long window the same number becomes a session quota an
 * ordinary browsing session trips — and a limit a legitimate user reaches is worse than none: the
 * 429 lands on them and reads as the app being broken, while an attacker just rotates IPs. A short
 * window also recovers: exhausting a 15-minute budget in the first two minutes locks the user out
 * for the remaining thirteen.
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

/**
 * Guards the Prometheus scrape endpoint.
 *
 * `/observability/metrics` cannot use the admin JWT the other observability routes use: it is
 * scraped by Prometheus, which has no way to log in, refresh a token, or hold a session. What
 * Prometheus does support is a static bearer credential in its `scrape_configs`
 * (`authorization: { type: Bearer, credentials: … }`), so that is the credential here.
 *
 * Left open, the endpoint is free reconnaissance: request volumes, error rates, latency
 * percentiles, in-flight counts, login success/failure counters, process uptime and heap. None of
 * it is user data, all of it is a map of how the service behaves and when it is weakest.
 *
 * Deny-by-default when `NODE_METRICS_TOKEN` is unset, rather than open-by-default: an
 * unauthenticated metrics endpoint is not a state to arrive at by forgetting a variable. The
 * shipped `.env-example` and compose config both set it, so the stack works out of the box —
 * change it, like any other secret, before it faces anything.
 *
 * `timingSafeEqual` rather than `===`: a byte-by-byte comparison that returns early leaks the
 * token's prefix to anyone willing to measure, and the whole token to anyone patient.
 */
export const isMetricsScraper = (request: Request, response: Response, next: NextFunction) => {
    const expected = process.env.NODE_METRICS_TOKEN;

    if (!expected) {
        logger.warn({
            message:
                'NODE_METRICS_TOKEN is not set — /observability/metrics is refusing every request.'
        });
        rejectResponse(response, 503, 'isMetricsScraper - not configured', []);
        return;
    }

    // The scheme is required, not stripped-if-present: accepting a bare token would mean the
    // credential is read from a header shape no client should be sending, which is one more way
    // for it to end up somewhere it was not meant to be.
    const authorization = request.header('Authorization') ?? '';
    const provided = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(provided);

    // `timingSafeEqual` throws on a length mismatch, which would itself be a length oracle — so
    // the lengths are compared first and the result folded into one boolean.
    const matches =
        expectedBytes.length === providedBytes.length &&
        timingSafeEqual(expectedBytes, providedBytes);

    if (!matches) {
        rejectResponse(response, 401, 'isMetricsScraper - bad credentials', []);
        return;
    }

    next();
};
