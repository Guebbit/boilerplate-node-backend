/**
 * @module
 * Order rules — `src/modules/orders/domain/rules.ts`. No mocks, no database, no fake timers:
 * the rules take arguments and return verdicts.
 */

import { checkOrderLines, type OrderLineCandidate } from '../../domain/rules';

/** A line whose product resolved. */
const line = (quantity = 1): OrderLineCandidate => ({ quantity, product: { price: 10 } });

describe('checkOrderLines', () => {
    it('refuses an empty set, naming the reason', () => {
        expect(checkOrderLines([])).toEqual({ ok: false, reason: 'no-lines' });
    });

    it('accepts lines whose products all resolved', () => {
        expect(checkOrderLines([line(), line(3)])).toEqual({ ok: true });
    });

    // The two reasons map to different status codes, so they must stay distinct.
    it.each([
        ['undefined', undefined],
        ['null', null]
    ])('refuses the whole set when a product is %s', (_label, product) => {
        expect(checkOrderLines([line(), { quantity: 1, product }])).toEqual({
            ok: false,
            reason: 'product-missing'
        });
    });

    it('refuses on an unresolved product even when other lines are fine', () => {
        // An order embeds a snapshot: a missing product cannot be dropped and the rest kept.
        expect(checkOrderLines([line(), line(), { quantity: 9, product: null }]).ok).toBe(false);
    });
});

// The soft-delete toggle and the read scope used to live here as `nextDeletionState` and
// `readScope`. Both were one-line expressions with one caller each, so they moved back into
// `service.ts`; `service-crud.test.ts` covers the toggle and `service-scope.test.ts` the scope,
// including the fail-closed cases.
