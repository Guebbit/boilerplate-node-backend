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
 *     leaves the other stale;
 *   - every budget a `rate-limits.ts` file actually builds into a limiter is also in its own
 *     manifest array — a limiter that is wired but unpublished is invisible to the docs generator
 *     and to every other check above;
 *   - every budget's env var is raised in `tests/support/setup.ts`, unless it carries a
 *     `testExemption` — see `RateLimitBudget` in `src/types/rate-limit-budget.ts` for what that
 *     means and why it is a decision recorded on the budget rather than a name typed here.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';
import { INFRASTRUCTURE_RATE_LIMITS } from '@infrastructure/http/middlewares/rate-limit';
import type { RateLimitBudget } from '@types';

/** Every module's own `rate-limits.ts`, plus infrastructure's — every file {@link reconcile} reads. */
const rateLimitSourceFiles = (): string[] => {
    const modulesRoot = path.join(__dirname, '../../src/modules');
    const moduleFiles = readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(modulesRoot, entry.name, 'rate-limits.ts'))
        .filter((file) => existsSync(file));
    return [
        ...moduleFiles,
        path.join(__dirname, '../../src/infrastructure/http/middlewares/rate-limit.ts')
    ];
};

/**
 * Every `BUDGET_NAME` a rate-limits file actually turns into a limiter
 * (`buildRateLimiter(BUDGET_NAME)`), against every `BUDGET_NAME` its own `RateLimitBudget[]`
 * manifest constant declares — read as TEXT, the same recipe {@link raisedInSetup} uses, so this
 * catches a budget that was wired into a real limiter without its author remembering to also add
 * it to the manifest array the docs generator and the tests above actually read.
 */
const reconcile = (file: string): { built: Set<string>; declared: Set<string> } => {
    const source = readFileSync(file, 'utf8');
    const built = new Set(
        [...source.matchAll(/buildRateLimiter\((\w+)\)/g)].map(([, name]) => name)
    );
    const manifest = /readonly RateLimitBudget\[] = \[([\S\s]*?)]/.exec(source);
    const declared = new Set(
        manifest
            ? manifest[1]
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean)
            : []
    );
    return { built, declared };
};

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
    return [...seen.entries()].filter(([, count]) => count > 1).map(([value]) => value);
};

/**
 * Every `process.env.NODE_..._RATE_LIMIT... ??=` (or `..._WINDOW_MS`/`..._MFA_...`) assignment in
 * `tests/support/setup.ts`, read as TEXT rather than imported — importing it here would run its
 * side effects (i18next init, locale registration) for a check that only needs its literal source.
 */
const raisedInSetup = (): Set<string> => {
    const setupSource = readFileSync(path.join(__dirname, '../support/setup.ts'), 'utf8');
    const matches = setupSource.matchAll(/process\.env\.(NODE_\w+)\s*\?\?=/g);
    return new Set([...matches].map(([, name]) => name));
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

    it('declares each budget in exactly one place — a module, or infrastructure, never both', () => {
        const infrastructureVars = new Set(
            INFRASTRUCTURE_RATE_LIMITS.map((budget) => budget.environmentVariable)
        );
        const redeclared = moduleBudgets.filter((budget) =>
            infrastructureVars.has(budget.environmentVariable)
        );

        expect(redeclared).toEqual([]);
    });

    it('declares every budget it builds — a limiter is not just wired, but published', () => {
        const undeclared = rateLimitSourceFiles().flatMap((file) => {
            const { built, declared } = reconcile(file);
            return [...built]
                .filter((name) => !declared.has(name))
                .map((name) => `${path.relative(path.join(__dirname, '../..'), file)}: ${name}`);
        });

        expect(undeclared).toEqual([]);
    });

    it('raises every budget without a testExemption in tests/support/setup.ts', () => {
        const raised = raisedInSetup();
        const missing = allBudgets
            .filter((budget) => budget.testExemption === undefined)
            .filter((budget) => !raised.has(budget.environmentVariable))
            .map((budget) => `${budget.owner}: ${budget.environmentVariable}`);

        expect(missing).toEqual([]);
    });

    it('exempts a budget from being raised only with a reason', () => {
        const blank = allBudgets.filter((budget) => budget.testExemption?.trim() === '');

        expect(blank).toEqual([]);
    });
});
