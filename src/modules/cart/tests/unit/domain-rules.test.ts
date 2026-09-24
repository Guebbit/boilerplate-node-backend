/**
 * @module
 * Cart rules — `src/modules/cart/domain/rules.ts`.
 *
 * No mocks, no database. The verdict-to-status mapping is covered in `service.test.ts`.
 */

import { evaluateCheckout, basketWeight, type CartLineCandidate } from '../../domain/rules';

/**
 * A line asking for `quantity`, against a product with `available` units left to sell — already
 * computed, the way the rule itself now receives it (its caller resolves `available` via
 * `@modules/products`'s `availableStock` before calling {@link evaluateCheckout}).
 */
const line = (quantity = 1, available?: number): CartLineCandidate => ({
    quantity,
    product: available === undefined ? {} : { available }
});

describe('evaluateCheckout', () => {
    it('refuses an empty cart', () => {
        expect(evaluateCheckout([])).toEqual({ ok: false, reason: 'empty' });
    });

    it('accepts a cart whose lines all resolved', () => {
        expect(evaluateCheckout([line(1, 10), line(2, 10)])).toEqual({ ok: true });
    });

    // `null` is the real case: `populate()` writes it when the product was hard-deleted.
    it.each([
        ['a deleted product (null)', null],
        ['an absent product (undefined)', undefined]
    ])('refuses a cart holding %s, naming it with no title to offer', (_label, product) => {
        expect(
            evaluateCheckout([line(1, 10), { quantity: 1, product, productId: 'gone' }])
        ).toEqual({
            ok: false,
            reason: 'product-unavailable',
            lines: [{ productId: 'gone', title: undefined }]
        });
    });

    /*
     * `populate()` follows the reference regardless of visibility — an inactive or soft-deleted
     * product still joins, `active`/`deletedAt` and all, unlike a hard-deleted one. This is what
     * lets a refusal here still NAME the product: the row is right there to read a title off.
     */
    it.each([
        ['deactivated', { title: 'Old Favourite', active: false }],
        ['soft-deleted', { title: 'Discontinued', deletedAt: new Date() }]
    ])('refuses a cart holding a %s product, with its title', (_label, product) => {
        expect(evaluateCheckout([line(1, 10), { quantity: 1, product, productId: 'p-1' }])).toEqual(
            {
                ok: false,
                reason: 'product-unavailable',
                lines: [{ productId: 'p-1', title: product.title }]
            }
        );
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
     * The case the reservation model added: units exist but are all promised, so `available` is
     * zero. The old single-count model saw this as comfortably in stock and refused it later, at
     * the write; now it's refused here, because availability — not the warehouse pile — is what a
     * customer can buy.
     */
    it('refuses a line whose units are all reserved', () => {
        expect(evaluateCheckout([line(1, 0)])).toMatchObject({
            ok: false,
            reason: 'insufficient-stock',
            shortfalls: [{ requested: 1, available: 0 }]
        });
    });

    it('accepts a line that fits in what is left after the holds', () => {
        expect(evaluateCheckout([line(3, 3)])).toEqual({ ok: true });
    });

    /*
     * A missing `available` means REFUSE, not allow. Reading absence as "unconstrained" would let
     * any quantity through on exactly the lines nothing is known about — the safe reading of "we
     * don't know how many" is "don't sell it".
     */
    it('treats an absent available count as nothing to sell', () => {
        expect(evaluateCheckout([line(1)])).toMatchObject({
            ok: false,
            reason: 'insufficient-stock',
            shortfalls: [{ requested: 1, available: 0 }]
        });
    });

    // Resolution outranks availability: a vanished product is the harder failure, and its 404
    // must not be masked by a 409 about a count nobody can see.
    it('reports an unresolved product before an unavailable one', () => {
        expect(
            evaluateCheckout([{ quantity: 9, product: null, productId: 'gone' }, line(6, 5)])
        ).toEqual({
            ok: false,
            reason: 'product-unavailable',
            lines: [{ productId: 'gone', title: undefined }]
        });
    });
});

describe('basketWeight', () => {
    it('sums each line’s weight times its quantity', () => {
        expect(
            basketWeight([
                { quantity: 2, product: { weight: 300 } },
                { quantity: 1, product: { weight: 1000 } }
            ])
        ).toBe(1600);
    });

    it('treats a missing weight as zero, not a refusal', () => {
        expect(basketWeight([{ quantity: 3, product: {} }])).toBe(0);
        expect(basketWeight([{ quantity: 3, product: null }])).toBe(0);
    });

    it('is zero for an empty basket', () => {
        expect(basketWeight([])).toBe(0);
    });
});
