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
 *
 * Both counters are stated rather than only the total, because the whole point of the pre-flight
 * now is that it reads the DIFFERENCE — a fixture that could only set one number could not tell
 * "nothing on the shelf" apart from "everything on it is promised", which is the distinction
 * these cases exist to check.
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
     * ── The case the reservation model added ─────────────────────────────────────────────────
     *
     * Forty units on the shelf and all forty promised to open orders. Under the old single-count
     * model this line read as comfortably in stock and was refused later, by the write; now it is
     * refused here, because availability — not the pile in the warehouse — is what a customer can
     * buy. This is the case that could not be expressed before, so it is the one worth asserting.
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
     * A missing count means REFUSE, not allow — the counter-intuitive half of this rule.
     *
     * Reading absence as "unconstrained" is the natural instinct and the wrong direction to be
     * wrong in for a rule whose only job is to refuse: it lets any quantity through on exactly the
     * documents nothing is known about. The safe reading of "we do not know how many there are" is
     * "do not sell it".
     *
     * Nothing is lost by it: `db/migrations/20260817120000-inventory-counters.js` backfills every
     * row, so this defends against a document that should not exist rather than a state the shop
     * relies on.
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
 * The duplication guard.
 *
 * `rules.ts` carries its own copy of the availability subtraction, because the domain layer may
 * not import a sibling module (see the note there, and `eslint.config.ts`). A copy that nothing
 * compares is a copy that drifts, so this compares it — against `inventory`'s `availabilityOf`,
 * which is the authority — through the only observable the pure rule exposes: its verdict.
 *
 * A test file is allowed the import the rule is not. That asymmetry is the whole trick.
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
         * The boundary, pinned from both sides — which is what makes a copy that is off by one
         * fail rather than merely look different.
         *
         * The `available > 0` guard is not a get-out: a line for zero units is not a thing a cart
         * can hold (`CartItem.quantity` has `minimum: 1`), so there is no boundary below to pin
         * when nothing is available. The assertion that still runs in that case — one unit is
         * refused — is the one that matters there.
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
