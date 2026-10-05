/**
 * @module
 * The merge rule (`planMergeLine`, in the cart's domain layer).
 *
 * No mocks, no database. The invariants are asserted over a grid of inputs, so a boundary an
 * example would miss still has to hold; the named cases pin which reason wins. Stock is not an
 * input: the rule adds what `POST /cart` would, and the shared `fitsStock` rule flags the result.
 */

import { planMergeLine, type MergeLineFacts } from '../../domain';

/** The cart's per-line ceiling, as the model declares it. */
const LINE_MAX = 999;

/** Facts with the ceiling filled in and the product listed; each case names only what it is about. */
const plan = (facts: Pick<MergeLineFacts, 'requested' | 'held'> & { listed?: boolean }) =>
    planMergeLine({ listed: true, ...facts, lineMax: LINE_MAX });

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

    it('says "unavailable" and adds nothing for a product the catalogue does not show', () => {
        expect(plan({ requested: 2, held: 0, listed: false })).toEqual({
            add: 0,
            reason: 'unavailable'
        });
    });

    describe('when several reasons apply, the first of unavailable, capped, summed wins', () => {
        it('capped beats summed', () => {
            expect(plan({ requested: 10, held: 995 }).reason).toBe('capped');
        });

        it('unavailable beats summed', () => {
            expect(plan({ requested: 1, held: 4, listed: false }).reason).toBe('unavailable');
        });

        it('unavailable beats capped', () => {
            expect(plan({ requested: 5, held: LINE_MAX, listed: false }).reason).toBe(
                'unavailable'
            );
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
            if (!facts.listed) expect(add).toBe(0);
        });

        it.each(grid)('names a reason exactly when the line did not land as asked: %j', (facts) => {
            const { add, reason } = plan(facts);
            const landedAsAsked = facts.listed && add === facts.requested && facts.held === 0;

            expect(reason === undefined).toBe(landedAsAsked);
        });
    });
});
