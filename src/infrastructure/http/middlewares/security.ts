import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { rejectResponse } from '@infrastructure/http/response';
import { logger } from '@infrastructure/adapters/logger';

/**
 * Default window and per-IP budget, used when the `NODE_RATE_LIMIT_*` variables are unset:
 * 100 requests per MINUTE, sized for browsing rather than for guessing.
 *
 * The test suites raise it tenfold — see `tests/support/setup.ts`.
 *
 * See: docs/tools/security.md#the-two-rate-limit-budgets
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
 * Rate limiter for endpoints that accept credentials or mint tokens — a separate, much smaller
 * budget, mounted per route so browsing never consumes it.
 *
 * `skipSuccessfulRequests` is on, so only failures count: a shared address does not lock its own
 * users out for succeeding.
 *
 * See: docs/tools/security.md#the-two-rate-limit-budgets
 */
export const authRateLimiter = rateLimit({
    windowMs: Number(process.env.NODE_RATE_LIMIT_WINDOW_MS) || DEFAULT_RATE_LIMIT_WINDOW_MS,
    limit: Number(process.env.NODE_AUTH_RATE_LIMIT_MAX) || DEFAULT_AUTH_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

/**
 * Guards the Prometheus scrape endpoint with a static bearer credential — Prometheus cannot hold a
 * session, so the admin JWT the other observability routes use is not available to it.
 *
 * DENY by default when `NODE_METRICS_TOKEN` is unset, and `timingSafeEqual` rather than `===`,
 * which would leak the token's prefix to anyone willing to measure.
 *
 * See: docs/tools/security.md#why-the-metrics-endpoint-has-its-own-credential
 */
export const isMetricsScraper = (request: Request, response: Response, next: NextFunction) => {
    const expected = process.env.NODE_METRICS_TOKEN;

    if (!expected) {
        logger.warn({
            message:
                'NODE_METRICS_TOKEN is not set — /observability/metrics is refusing every request.'
        });
        rejectResponse(response, 503, []);
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
        rejectResponse(response, 401, []);
        return;
    }

    next();
};
