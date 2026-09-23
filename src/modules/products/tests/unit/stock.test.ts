/**
 * @module
 * `availableStock` — `src/modules/products/domain/stock.ts`. Pure, no database: every case a
 * caller (`@modules/inventory`, `@modules/cart`) can hand it.
 */
import { availableStock } from '../../domain/stock';

describe('availableStock', () => {
    it.each([
        [10, 0, 10],
        [10, 4, 6],
        [10, 10, 0],
        // Absent counters read as nothing to sell, not as unlimited — the safe direction for a
        // number that decides whether to take someone's money.
        [undefined, undefined, 0],
        [5, undefined, 5],
        [undefined, 5, 0]
    ])('reads onHand %j, reserved %j as %i', (onHand, reserved, expected) => {
        expect(availableStock(onHand, reserved)).toBe(expected);
    });

    it('clamps a would-be negative at zero', () => {
        // Should be unreachable — every inventory transition guards against it — but a negative
        // count must never reach a screen, so the clamp is asserted rather than assumed.
        expect(availableStock(3, 8)).toBe(0);
    });
});
