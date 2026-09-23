/**
 * `scripts/mutation/mutate-scope.ts` — whether a path is inside Stryker's own `mutate` scope, and
 * the diff/scope intersection `run-diff.ts`'s CLI wrapper hands its files to `--mutate`. Pure
 * input/output, like `local-policy.test.ts` next door: the CLI stays a thin, untested wrapper.
 */
import { changedMutable, isMutable } from '../../../../scripts/mutation/mutate-scope';

/** A stand-in for `stryker.json`'s own `mutate`, small enough to reason about by hand. */
const PATTERNS = [
    'src/infrastructure/**/*.ts',
    'src/kernel/**/*.ts',
    'src/modules/*/**/*.ts',
    '!src/modules/*/index.ts',
    '!src/modules/*/tests/**'
];

describe('isMutable', () => {
    it('accepts a module file the include globs cover', () => {
        expect(isMutable('src/modules/orders/service.ts', PATTERNS)).toBe(true);
    });

    it('accepts infrastructure and kernel files the same way', () => {
        expect(isMutable('src/infrastructure/http/request.ts', PATTERNS)).toBe(true);
        expect(isMutable('src/kernel/registry.ts', PATTERNS)).toBe(true);
    });

    it('excludes a module barrel, even though the include globs would otherwise match it', () => {
        expect(isMutable('src/modules/orders/index.ts', PATTERNS)).toBe(false);
    });

    it('excludes a module test file the same way', () => {
        expect(isMutable('src/modules/orders/tests/factories.ts', PATTERNS)).toBe(false);
    });

    it('rejects a file no include glob covers at all', () => {
        expect(isMutable('src/types/rate-limit-budget.ts', PATTERNS)).toBe(false);
        expect(isMutable('src/app.ts', PATTERNS)).toBe(false);
    });
});

describe('changedMutable', () => {
    it('keeps only what a diff and the mutate scope both name', () => {
        const changed = [
            'src/modules/orders/service.ts',
            // Real in the diff, but not in scope — either deleted since (so `mutableFiles()`
            // never walked it) or excluded by Stryker's own globs, the two cases B27 conflated.
            'src/modules/orders/index.ts',
            'docs/modules/orders.md'
        ];
        const mutable = ['src/modules/orders/service.ts', 'src/modules/products/service.ts'];

        expect(changedMutable(changed, mutable)).toEqual(['src/modules/orders/service.ts']);
    });

    it('returns nothing when the diff and the scope share no file', () => {
        expect(changedMutable(['README.md'], ['src/modules/orders/service.ts'])).toEqual([]);
    });
});
