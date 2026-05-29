import { rateLimit } from 'express-rate-limit';

/*
 * Global IP-based rate limiter.
 * Configurable via NODE_RATE_LIMIT_WINDOW_MS and NODE_RATE_LIMIT_MAX env vars.
 */
export const rateLimiter = rateLimit({
    windowMs: Number(process.env.NODE_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    limit: Number(process.env.NODE_RATE_LIMIT_MAX) || 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});
