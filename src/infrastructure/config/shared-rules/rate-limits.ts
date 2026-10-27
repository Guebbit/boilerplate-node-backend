/**
 * @module
 * The schema of a rate-limit budget's DATA, as written in `shared/rules/rate-limits.yaml` (the
 * kernel's budgets) and in each module's `module.yaml` `rateLimits:` block.
 *
 * Only the fields a twin backend must copy: how a caller is bucketed (`keyGenerator`), what a
 * success is and what is skipped stay code. `RateLimitBudget` (`@types`) is this plus that code.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** One budget's data. Strict: an extra key is a typo, or a behaviour that belongs in code. */
export const rateLimitBudgetDataSchema = z.strictObject({
    /** Short row label for the generated table in `docs/tools/security.md`. */
    name: z.string().min(1),
    /** Redis/memory key prefix. The entry's key is this in camelCase. */
    namespace: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/),
    /** The environment variable that overrides `defaultMax`. */
    environmentVariable: z.string().regex(/^NODE_[A-Z0-9_]+$/),
    /** The budget when `environmentVariable` is unset. */
    defaultMax: z.int().positive(),
    /** The window in milliseconds, or `shared` for `NODE_RATE_LIMIT_WINDOW_MS`. */
    windowMs: z.union([z.literal('shared'), z.int().positive()]),
    /** One line: what the budget bounds and why. */
    bounds: z.string().min(1),
    /** Whether a refusal emits an audit event. */
    audited: z.boolean(),
    /** What the budget does while the limits Redis is down; absent means `memory`. */
    onStoreError: z.enum(['memory', 'pass']).optional()
});

/**
 * The camelCase of a namespace: `credentials-identity` becomes `credentialsIdentity`.
 *
 * @param namespace - a budget's namespace
 */
const camelCaseOf = (namespace: string): string =>
    namespace.replaceAll(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

/** A `rateLimits:` block: budgets keyed by their namespace in camelCase. */
export const rateLimitsBlockSchema = z
    .record(z.string(), rateLimitBudgetDataSchema)
    .refine(
        (block) =>
            Object.entries(block).every(([key, budget]) => key === camelCaseOf(budget.namespace)),
        { message: 'a budget is keyed by its namespace in camelCase' }
    );

/** Shape of `shared/rules/rate-limits.yaml`. */
export const rateLimitsSchema = z.strictObject({ rateLimits: rateLimitsBlockSchema });
