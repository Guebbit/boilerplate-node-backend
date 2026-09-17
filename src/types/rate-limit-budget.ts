/**
 * @module
 * {@link RateLimitBudget} — one rate-limit budget's DATA, declared on a module's manifest
 * (`AppModule.rateLimits` in `@kernel/registry`) and turned into the actual Express middleware by
 * `buildRateLimiter` (`@infrastructure/http/middlewares/rate-limit`).
 *
 * Lives under `src/types/` rather than beside `AppModule` in `@kernel/registry`: infrastructure
 * builds a limiter FROM this shape, and infrastructure may not import kernel — only downward, into
 * `types`, which is erased at compile time and carries no such wall.
 *
 * See: docs/tools/security.md#the-rate-limit-budgets
 */

import type { Request } from 'express';

/**
 * One rate-limit budget's DATA — namespace, env var, default, window, key strategy, what it
 * bounds, whether it audits a refusal — turned into the actual Express middleware by
 * `buildRateLimiter`, the one factory every budget in the app, module-owned or
 * infrastructure-owned, is built from.
 */
export interface RateLimitBudget {
    /** Short, human-readable row label for the generated table in `docs/tools/security.md`. */
    name: string;

    /** This budget's Redis/memory key prefix — see `rate-limit-store.ts`. */
    namespace: string;

    /** The environment variable that overrides `defaultMax`. */
    environmentVariable: string;

    /** The budget when `environmentVariable` is unset. */
    defaultMax: number;

    /**
     * The window, in ms. `'shared'` reads `NODE_RATE_LIMIT_WINDOW_MS` the way most budgets do; a
     * literal number is a budget windowed to something other than ordinary browsing — the two MFA
     * challenge budgets, sized to the challenge's own lifetime instead.
     */
    windowMs: number | 'shared';

    /** What a caller is bucketed by, in one line, for the generated table — e.g. "per account". */
    keyedBy: string;

    /** One line: what this budget bounds and why, for the generated table. */
    bounds: string;

    /** Whether a refusal emits an audit event. */
    audited: boolean;

    /** What a request is actually bucketed by. Omitted means the caller's single address. */
    keyGenerator?: (request: Request) => string;

    /** Only a FAILED request spends the budget — see `credentialLimiters`. */
    skipSuccessfulRequests?: boolean;

    /**
     * Reads a custom outcome instead of the response status — see the payments module's decline
     * budget, which must count a genuine decline and not the confirm route's other 409.
     */
    requestWasSuccessful?: (request: Request) => boolean;

    /**
     * Where `express-rate-limit` stores this limiter's counter on `request`, for a downstream
     * gate that reads it back — see `loginChallengeGate`/`paymentDeclineChallengeGate`. Omitted
     * for a budget nothing reads back.
     */
    requestPropertyName?: string;

    /**
     * Why this budget's env var is deliberately NOT raised in `tests/support/setup.ts`, when it
     * isn't. Absent means `tests/cross-cutting/rate-limit-budgets.test.ts` requires it raised;
     * present is that test's exemption, and the reason it prints on failure.
     */
    testExemption?: string;
}
