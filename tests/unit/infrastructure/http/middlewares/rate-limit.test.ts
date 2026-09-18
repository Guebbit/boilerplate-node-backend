/**
 * `src/infrastructure/http/middlewares/rate-limit.ts` — the budgets no one module owns (the
 * global brake, the api-key budget, the upload budget). Every other module's own budgets are
 * pinned in that module's own `tests/unit/rate-limits.test.ts` (e.g.
 * `src/modules/account/tests/unit/rate-limits.test.ts`); the relationships BETWEEN a module's
 * budget and this file's global one — "stays a small fraction of the browsing budget" — are
 * cross-cutting and live in `tests/cross-cutting/rate-limit-budgets.test.ts`. The metrics scrape
 * guard, `isMetricsScraper`, moved to `src/modules/observability` — it guards one module's own
 * route, not a shared budget — and is pinned in that module's own
 * `tests/unit/metrics-scraper.test.ts`.
 */
import {
    DEFAULT_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_API_KEY_RATE_LIMIT_MAX,
    DEFAULT_UPLOAD_RATE_LIMIT_MAX
} from '@infrastructure/http/middlewares/rate-limit';

describe('rate limit defaults', () => {
    it('measures the browsing budget per minute', () => {
        // The window is the load-bearing half of the pair: the same 100 requests spread over a
        // quarter of an hour is a session quota an ordinary browsing session trips.
        expect(DEFAULT_RATE_LIMIT_WINDOW_MS).toBe(60 * 1000);
        expect(DEFAULT_RATE_LIMIT_MAX).toBe(100);
    });

    it('keeps the upload budget a small fraction of the browsing budget', () => {
        expect(DEFAULT_UPLOAD_RATE_LIMIT_MAX).toBeLessThan(DEFAULT_RATE_LIMIT_MAX / 2);
    });

    it('sizes the api-key budget above the upload budget, below the browsing one', () => {
        // A partner integration's steady state is well above one browsing session but must never
        // out-run the address-keyed global brake layered on top of it.
        expect(DEFAULT_API_KEY_RATE_LIMIT_MAX).toBeGreaterThan(DEFAULT_UPLOAD_RATE_LIMIT_MAX);
        expect(DEFAULT_API_KEY_RATE_LIMIT_MAX).toBeLessThan(DEFAULT_RATE_LIMIT_MAX * 2);
    });
});

/*
 * The behavioural property — a SUCCESSFUL request spending the budget — sends a real request
 * through `express-rate-limit`'s middleware, which `no-restricted-imports` treats as an
 * integration concern: see `src/modules/feedback/tests/integration/submission-rate-limit.test.ts`.
 */
