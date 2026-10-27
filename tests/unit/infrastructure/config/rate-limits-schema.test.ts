/**
 * The schema of a budget's data (`src/infrastructure/config/shared-rules/rate-limits.ts`): the rules that keep the one YAML
 * block per module honest. The values themselves are pinned by each module's budget tests.
 */

import { rateLimitsBlockSchema } from '../../../../src/infrastructure/config/shared-rules/rate-limits';

/** One valid entry, to break one field at a time. */
const entry = {
    name: 'Checkouts',
    namespace: 'cart-merge',
    environmentVariable: 'NODE_CART_MERGE_RATE_LIMIT_MAX',
    defaultMax: 10,
    windowMs: 'shared',
    bounds: 'Merges.',
    audited: true
};

describe('rateLimitsBlockSchema', () => {
    it('accepts an entry keyed by its namespace in camelCase', () => {
        expect(rateLimitsBlockSchema.safeParse({ cartMerge: entry }).success).toBe(true);
    });

    it('refuses an entry keyed by anything else', () => {
        expect(rateLimitsBlockSchema.safeParse({ merge: entry }).success).toBe(false);
    });

    it('refuses a field it does not know, since behaviour belongs in code', () => {
        expect(
            rateLimitsBlockSchema.safeParse({ cartMerge: { ...entry, skip: true } }).success
        ).toBe(false);
    });

    it.each([0, -1, 1.5])('refuses defaultMax %s', (defaultMax) => {
        expect(
            rateLimitsBlockSchema.safeParse({ cartMerge: { ...entry, defaultMax } }).success
        ).toBe(false);
    });

    it('takes a window in milliseconds, or `shared`', () => {
        expect(
            rateLimitsBlockSchema.safeParse({ cartMerge: { ...entry, windowMs: 900_000 } }).success
        ).toBe(true);
        expect(
            rateLimitsBlockSchema.safeParse({ cartMerge: { ...entry, windowMs: 'hourly' } }).success
        ).toBe(false);
    });
});
