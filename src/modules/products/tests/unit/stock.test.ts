/**
 * @module
 * `availableStock` and `preorderAllowanceLeft` — `src/modules/products/domain/stock.ts`. Pure, no database: every case a
 * caller (`@modules/inventory`, `@modules/cart`) can hand it.
 */
import { availableStock, preorderAllowanceLeft } from '../../domain/stock';

describe('availableStock', () => {
    it.each([
        [10, 0, 10],
        [10, 4, 6],
        [10, 10, 0],
        /**
         * Absent counters read as nothing to sell, not as unlimited — the safe direction for a
         * number that decides whether to take someone's money.
         */
        [undefined, undefined, 0],
        [5, undefined, 5],
        [undefined, 5, 0]
    ])('reads onHand %j, reserved %j as %i', (onHand, reserved, expected) => {
        expect(availableStock(onHand, reserved)).toBe(expected);
    });

    it('clamps a would-be negative at zero', () => {
        /**
         * Should be unreachable — every inventory transition guards against it — but a negative
         * count must never reach a screen, so the clamp is asserted rather than assumed.
         */
        expect(availableStock(3, 8)).toBe(0);
    });
});

describe('preorderAllowanceLeft', () => {
    it.each([
        [10, 3, 7],
        [10, 10, 0],
        [3, 5, 0],
        [undefined, undefined, 0],
        [4, undefined, 4],
        // No cap: the contract wants an integer, and the buyer is never told the count.
        [null, 5, 999_999]
    ])('allows %s with %s claimed to leave %s', (limit, claimed, expected) => {
        expect(preorderAllowanceLeft(limit, claimed)).toBe(expected);
    });
});
