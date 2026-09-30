/**
 * `src/infrastructure/http/middlewares/rate-limit.ts` — the budgets no one module owns (the
 * global brake, the api-key budget, the upload budget). Every other module's own budgets are
 * pinned in that module's own `tests/unit/rate-limits.test.ts` (e.g.
 * `src/modules/account/tests/unit/rate-limits.test.ts`); the relationships BETWEEN a module's
 * budget and this file's global one — "stays a small fraction of the browsing budget" — are
 * cross-cutting and live in `tests/cross-cutting/rate-limit-budgets.test.ts`. The metrics scrape
 * guard, `isMetricsScraper`, lives in `src/modules/observability` — it guards one module's own
 * route, not a shared budget — and is pinned in that module's own
 * `tests/unit/metrics-scraper.test.ts`.
 */
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { asStub } from '@tests/stub';
import {
    identityOf,
    DEFAULT_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    DEFAULT_API_KEY_RATE_LIMIT_MAX,
    DEFAULT_UPLOAD_RATE_LIMIT_MAX,
    INFRASTRUCTURE_RATE_LIMITS
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

/** A request as a limiter sees it: `body` is whatever the parsers left, `ip` the caller. */
const requestWith = (body: unknown, ip: string) => asStub<Request>({ body, ip });

/** A request as the global budget's `skip` sees it: only `method` and `path` matter. */
const requestFor = (method: string, path: string) => asStub<Request>({ method, path });

/**
 * The global browsing budget's own `skip` — an orchestrator's `/livez` and `/readyz` probes, on a fixed
 * interval, must never trip the budget every other caller shares (PL-27).
 */
describe("the global budget's skip", () => {
    const globalBudget = INFRASTRUCTURE_RATE_LIMITS.find(
        (budget) => budget.name === 'Browsing (global)'
    );

    it('exempts GET /readyz', () => {
        expect(globalBudget?.skip?.(requestFor('GET', '/readyz'))).toBe(true);
    });

    it('does not exempt other methods on /readyz', () => {
        expect(globalBudget?.skip?.(requestFor('POST', '/readyz'))).toBe(false);
    });

    it('exempts GET /livez, and not POST', () => {
        expect(globalBudget?.skip?.(requestFor('GET', '/livez'))).toBe(true);
        expect(globalBudget?.skip?.(requestFor('POST', '/livez'))).toBe(false);
    });

    it('does not exempt GET on any other path', () => {
        expect(globalBudget?.skip?.(requestFor('GET', '/products'))).toBe(false);
    });
});

describe('identityOf', () => {
    it('never keys on a bare sha256 of the email — a Redis dump must not be dictionary-attackable', () => {
        const bare = createHash('sha256').update('ada@example.com').digest('hex');
        const key = identityOf(requestWith({ email: 'ada@example.com' }, '1.2.3.4'));

        expect(key).toMatch(/^[\da-f]{64}$/);
        expect(key).not.toBe(bare);
    });

    it('buckets one account the same however its email is cased', () => {
        expect(identityOf(requestWith({ email: 'Ada@Example.com' }, '1.2.3.4'))).toBe(
            identityOf(requestWith({ email: 'ada@example.com ' }, '5.6.7.8'))
        );
    });

    it('buckets an attempt naming nobody by its address block, not one shared bucket', () => {
        // An unparsed multipart body is exactly this: nothing to read.
        const first = identityOf(requestWith({}, '1.2.3.4'));

        expect(first).toBe(identityOf(requestWith(undefined, '1.2.3.200')));
        expect(first).not.toBe(identityOf(requestWith({}, '9.9.9.9')));
    });
});
