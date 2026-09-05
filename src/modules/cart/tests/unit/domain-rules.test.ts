/**
 * @module
 * Cart rules — `src/modules/cart/domain/rules.ts`.
 *
 * No mocks, no database. The verdict-to-status mapping is covered in `service.test.ts`.
 */

import { evaluateCheckout, type CartLineCandidate } from '../../domain/rules';
import { availabilityOf } from '@modules/inventory';

/**
 * A line asking for `quantity`, against a product holding `onHand` with `reserved` spoken for.
 * Both counters are stated, not just the total: the pre-flight reads the DIFFERENCE, and a
 * fixture with only one number couldn't distinguish "nothing on the shelf" from "all promised".
 */
const line = (quantity = 1, onHand?: number, reserved = 0): CartLineCandidate => ({
    quantity,
    product: onHand === undefined ? {} : { onHand, reserved }
});

describe('evaluateCheckout', () => {
    it('refuses an empty cart', () => {
        expect(evaluateCheckout([])).toEqual({ ok: false, reason: 'empty' });
    });

    it('accepts a cart whose lines all resolved', () => {
        expect(evaluateCheckout([line(1, 10), line(2, 10)])).toEqual({ ok: true });
    });

    // `null` is the real case: `populate()` writes it when the product was deleted.
    it.each([
        ['a deleted product (null)', null],
        ['an absent product (undefined)', undefined]
    ])('refuses a cart holding %s', (_label, product) => {
        expect(evaluateCheckout([line(1, 10), { quantity: 1, product }])).toEqual({
            ok: false,
            reason: 'product-unavailable'
        });
    });

    // Order matters: the two reasons map to different status codes and analytics categories.
    it('reports emptiness before availability', () => {
        expect(evaluateCheckout([])).toEqual({ ok: false, reason: 'empty' });
    });

    it('refuses a line asking for more than the shelf holds', () => {
        expect(evaluateCheckout([line(1, 5), line(6, 5)])).toMatchObject({
            ok: false,
            reason: 'insufficient-stock',
            shortfalls: [{ requested: 6, available: 5 }]
        });
    });

    it('accepts a line taking exactly the last units', () => {
        expect(evaluateCheckout([line(5, 5)])).toEqual({ ok: true });
    });

    /*
     * The case the reservation model added: forty units on the shelf, all forty promised. The
     * old single-count model saw this as comfortably in stock and refused it later, at the
     * write; now it's refused here, because availability — not the warehouse pile — is what a
     * customer can buy.
     */
    it('refuses a line whose units are all reserved', () => {
        expect(evaluateCheckout([line(1, 40, 40)])).toMatchObject({
            ok: false,
            reason: 'insufficient-stock',
            // Forty units exist and none is sellable — the shortfall reports availability.
            shortfalls: [{ requested: 1, available: 0 }]
        });
    });

    it('accepts a line that fits in what is left after the holds', () => {
        expect(evaluateCheckout([line(3, 40, 37)])).toEqual({ ok: true });
    });

    /*
     * A missing count means REFUSE, not allow. Reading absence as "unconstrained" would let any
     * quantity through on exactly the documents nothing is known about — the safe reading of "we
     * don't know how many" is "don't sell it". The schema defaults both counters, so this defends
     * a document that shouldn't exist, not a state the shop relies on.
     */
    it('treats absent counters as nothing to sell', () => {
        expect(evaluateCheckout([line(1)])).toMatchObject({
            ok: false,
            reason: 'insufficient-stock',
            shortfalls: [{ requested: 1, available: 0 }]
        });
    });

    // Resolution outranks availability: a vanished product is the harder failure, and its 404
    // must not be masked by a 409 about a count nobody can see.
    it('reports an unresolved product before an unavailable one', () => {
        expect(evaluateCheckout([{ quantity: 9, product: null }, line(6, 5)])).toEqual({
            ok: false,
            reason: 'product-unavailable'
        });
    });
});

/**
 * The duplication guard: `rules.ts` carries its own copy of the availability subtraction because
 * the domain layer may not import a sibling module. This compares it against `inventory`'s
 * `availabilityOf` — the authority — through the only observable the pure rule exposes: its
 * verdict. A test file may import the rule that the domain layer may not.
 */
describe('availability agrees with the inventory authority', () => {
    const cases: { onHand: number; reserved: number }[] = [
        { onHand: 0, reserved: 0 },
        { onHand: 10, reserved: 0 },
        { onHand: 10, reserved: 3 },
        { onHand: 10, reserved: 10 },
        // The state that should be unreachable. Both copies clamp at zero; asserting it here is
        // what stops one of them quietly starting to return a negative.
        { onHand: 5, reserved: 8 }
    ];

    it.each(cases)('onHand $onHand, reserved $reserved', ({ onHand, reserved }) => {
        const available = availabilityOf({ onHand, reserved });

        /*
         * The boundary, pinned from both sides — what makes an off-by-one copy fail rather than
         * merely look different. `available > 0` is not a get-out: a zero-unit line isn't a thing
         * a cart can hold (`CartItem.quantity` has `minimum: 1`), so the assertion that still
         * runs there — one unit refused — is the one that matters.
         */
        if (available > 0)
            expect(evaluateCheckout([line(available, onHand, reserved)])).toEqual({ ok: true });

        expect(evaluateCheckout([line(available + 1, onHand, reserved)])).toMatchObject({
            ok: false,
            reason: 'insufficient-stock',
            shortfalls: [{ requested: available + 1, available }]
        });
    });
});
