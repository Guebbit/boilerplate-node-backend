/**
 * Looking up one of a module's declared {@link RateLimitBudget}s by name, in a unit suite that
 * pins the RELATIONSHIP between two budgets' numbers — see e.g.
 * `src/modules/account/tests/unit/rate-limits.test.ts` and its feedback/payments twins.
 */

import type { RateLimitBudget } from '@types';

/** One declared budget, by its `namespace` — throws loudly rather than reading `undefined`. */
export const budgetIn = (
    budgets: readonly RateLimitBudget[],
    namespace: string
): RateLimitBudget => {
    const found = budgets.find((each) => each.namespace === namespace);
    if (!found) throw new Error(`No rate-limit budget named "${namespace}"`);
    return found;
};
