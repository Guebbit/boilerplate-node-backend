/**
 * @module
 * The merge rule (`planMergeLine`, in the cart's domain layer).
 *
 * No mocks, no database. The invariants are asserted over a grid of inputs, so a boundary an
 * example would miss still has to hold; the named cases pin which reason wins. Stock clamps after
 * the ceiling, and the plan names the verdict for the caller to warn with.
 */

import { planMergeLine, type MergeLineFacts } from '../../domain';

/** The cart's per-line ceiling, as the model declares it. */
const LINE_MAX = 999;

/** The most lines a cart may hold in these cases. */
const MAX_LINES = 100;

/** Facts with the ceilings filled in, the product listed and room for a new line; each case names only what it is about. */
const plan = (
    facts: Pick<MergeLineFacts, 'requested' | 'held'> &
        Partial<Pick<MergeLineFacts, 'listed' | 'lines' | 'quantityAvailable'>>
) =>
    planMergeLine({
        listed: true,
        lines: 0,
        quantityAvailable: undefined,
        ...facts,
        lineMax: LINE_MAX,
        maxLines: MAX_LINES
    });

describe('planMergeLine', () => {
    it('adds the whole line, with no reason, when nothing is held', () => {
        expect(plan({ requested: 3, held: 0 })).toEqual({ add: 3 });
    });

    it('says "summed" when the cart already held some of the product', () => {
        expect(plan({ requested: 4, held: 3 })).toEqual({ add: 4, reason: 'summed' });
    });

    it('says "capped" when the sum would pass the ceiling, and adds only what fits', () => {
        expect(plan({ requested: 5, held: 998 })).toEqual({ add: 1, reason: 'capped' });
    });

    it('says "capped" and adds nothing when the line is already at the ceiling', () => {
        expect(plan({ requested: 1, held: LINE_MAX })).toEqual({ add: 0, reason: 'capped' });
    });

    it('says "capped" for a single line asking for more than the ceiling', () => {
        expect(plan({ requested: 1000, held: 0 })).toEqual({ add: LINE_MAX, reason: 'capped' });
    });

    it('lands exactly on the ceiling without a reason when it is reached, not passed', () => {
        expect(plan({ requested: LINE_MAX, held: 0 })).toEqual({ add: LINE_MAX });
    });

    it('says "removed" and adds nothing for a product the catalogue does not show', () => {
        expect(plan({ requested: 2, held: 0, listed: false })).toEqual({
            add: 0,
            reason: 'removed'
        });
    });

    it('says "cart_full" and adds nothing for a new product when every line is taken', () => {
        expect(plan({ requested: 2, held: 0, lines: MAX_LINES })).toEqual({
            add: 0,
            reason: 'cart_full'
        });
    });

    it('still grows a line the full cart already holds', () => {
        expect(plan({ requested: 2, held: 3, lines: MAX_LINES })).toEqual({
            add: 2,
            reason: 'summed'
        });
    });

    describe('stock', () => {
        it('adds the whole line when there is no limit', () => {
            expect(plan({ requested: 50, held: 0, quantityAvailable: undefined })).toEqual({
                add: 50
            });
        });

        it('adds only what can be bought, and says how far it was held back', () => {
            expect(plan({ requested: 5, held: 0, quantityAvailable: 3 })).toEqual({
                add: 3,
                stock: { code: 'MERCHANDISE_NOT_ENOUGH_STOCK', wanted: 5 }
            });
        });

        it('judges the sum against the number, not the guest line alone', () => {
            expect(plan({ requested: 2, held: 3, quantityAvailable: 4 })).toEqual({
                add: 1,
                reason: 'summed',
                stock: { code: 'MERCHANDISE_NOT_ENOUGH_STOCK', wanted: 5 }
            });
        });

        it('adds nothing, out of stock, when none can be bought', () => {
            expect(plan({ requested: 2, held: 0, quantityAvailable: 0 })).toEqual({
                add: 0,
                stock: { code: 'MERCHANDISE_OUT_OF_STOCK', wanted: 2 }
            });
        });

        it('never lowers a line already above the number', () => {
            expect(plan({ requested: 1, held: 8, quantityAvailable: 3 })).toEqual({
                add: 0,
                reason: 'summed',
                stock: { code: 'MERCHANDISE_NOT_ENOUGH_STOCK', wanted: 9 }
            });
        });

        it('applies the stock limit to what the ceiling left, and keeps the ceiling reason', () => {
            expect(plan({ requested: 5, held: 996, quantityAvailable: 998 })).toEqual({
                add: 2,
                reason: 'capped',
                stock: { code: 'MERCHANDISE_NOT_ENOUGH_STOCK', wanted: 999 }
            });
        });

        it('says nothing about stock for a product that is not shown', () => {
            expect(plan({ requested: 2, held: 0, listed: false, quantityAvailable: 0 })).toEqual({
                add: 0,
                reason: 'removed'
            });
        });
    });

    describe('when several reasons apply, the first of removed, cart_full, capped, summed wins', () => {
        it('removed beats cart_full', () => {
            expect(plan({ requested: 1, held: 0, lines: MAX_LINES, listed: false }).reason).toBe(
                'removed'
            );
        });

        it('cart_full beats capped', () => {
            expect(plan({ requested: 1000, held: 0, lines: MAX_LINES }).reason).toBe('cart_full');
        });

        it('capped beats summed', () => {
            expect(plan({ requested: 10, held: 995 }).reason).toBe('capped');
        });

        it('removed beats summed', () => {
            expect(plan({ requested: 1, held: 4, listed: false }).reason).toBe('removed');
        });

        it('removed beats capped', () => {
            expect(plan({ requested: 5, held: LINE_MAX, listed: false }).reason).toBe('removed');
        });
    });

    describe('for every combination of request, holding and visibility', () => {
        const quantities = [1, 2, 5, 998, 999];
        const holdings = [0, 1, 7, 998, 999];
        const visibility = [true, false];

        const grid = quantities.flatMap((requested) =>
            holdings.flatMap((held) => visibility.map((listed) => ({ requested, held, listed })))
        );

        it.each(grid)('keeps the cart honest: %j', (facts) => {
            const { add } = plan(facts);
            const resulting = facts.held + add;

            // A merge only adds, never past the ceiling, never more than was asked for.
            expect(add).toBeGreaterThanOrEqual(0);
            expect(resulting).toBeLessThanOrEqual(LINE_MAX);
            expect(add).toBeLessThanOrEqual(facts.requested);
            // A product that is not shown takes nothing.
            expect(!facts.listed && add > 0).toBe(false);
        });

        it.each(grid)('names a reason exactly when the line did not land as asked: %j', (facts) => {
            const { add, reason } = plan(facts);
            const landedAsAsked = facts.listed && add === facts.requested && facts.held === 0;

            expect(reason === undefined).toBe(landedAsAsked);
        });
    });
});
