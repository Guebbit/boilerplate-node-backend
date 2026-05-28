import { rateLimit } from 'express-rate-limit';

/**
 * Global IP-based rate limiter: max 100 requests per 15-minute window.
 * Adds standard RateLimit headers (draft-7) and rejects excess requests with HTTP 429.
 */
export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false // Disable the `X-RateLimit-*` headers.
});
