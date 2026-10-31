/**
 * Every rate-limit budget in the app, module-owned or infrastructure-owned, is internally
 * consistent as a SET:
 *
 *   - no two budgets share a `name` or an `environmentVariable` — either collision is silent:
 *     two budgets answering to one env var means one of them is actually unconfigurable, and two
 *     rows sharing a name is indistinguishable in the generated table;
 *   - no two share a `namespace` either — that is the Redis key prefix, so a collision would mean
 *     two logically distinct budgets counting into the SAME bucket;
 *   - nothing a module declares is also declared in `INFRASTRUCTURE_RATE_LIMITS` — ownership is
 *     exactly one place, or a docs/test reader sees a budget twice and a change to one silently
 *     leaves the other stale.
 */
import { enabledModules } from '../../src/modules';
import { INFRASTRUCTURE_RATE_LIMITS } from '@infrastructure/http/middlewares/rate-limit';
import type { RateLimitBudget } from '@types';

/** Every module-declared budget, tagged with the module that owns it. */
const moduleBudgets: (RateLimitBudget & { owner: string })[] = enabledModules.flatMap((appModule) =>
    (appModule.rateLimits ?? []).map((budget) => ({ ...budget, owner: appModule.name }))
);

/** Every budget in the app — module-owned first, then infrastructure's own. */
const allBudgets: (RateLimitBudget & { owner: string })[] = [
    ...moduleBudgets,
    ...INFRASTRUCTURE_RATE_LIMITS.map((budget) => ({ ...budget, owner: 'infrastructure' }))
];

/** Duplicate values of one field, across every budget — empty means none. */
const duplicatesOf = (field: 'name' | 'namespace' | 'environmentVariable'): string[] => {
    const seen = new Map<string, number>();
    for (const budget of allBudgets) seen.set(budget[field], (seen.get(budget[field]) ?? 0) + 1);
    return [...seen].filter(([, count]) => count > 1).map(([value]) => value);
};

describe('rate-limit budgets, as a set', () => {
    it('names every budget uniquely', () => {
        expect(duplicatesOf('name')).toEqual([]);
    });

    it('gives every budget its own env var', () => {
        expect(duplicatesOf('environmentVariable')).toEqual([]);
    });

    it('gives every budget its own Redis namespace', () => {
        expect(duplicatesOf('namespace')).toEqual([]);
    });

    // A new budget fails SECURE without asking (`onStoreError` defaults to `memory`); passing a
    // request unbudgeted during a Redis outage is a decision, and this is the list of them.
    it('lets a request through a store outage only on the browsing brake', () => {
        const passing = allBudgets
            .filter((budget) => budget.onStoreError === 'pass')
            .map((budget) => budget.namespace);

        expect(passing).toEqual(['global']);
    });

    it('declares each budget in exactly one place — a module, or infrastructure, never both', () => {
        const infrastructureVars = new Set(
            INFRASTRUCTURE_RATE_LIMITS.map((budget) => budget.environmentVariable)
        );
        const redeclared = moduleBudgets.filter((budget) =>
            infrastructureVars.has(budget.environmentVariable)
        );

        expect(redeclared).toEqual([]);
    });
});
