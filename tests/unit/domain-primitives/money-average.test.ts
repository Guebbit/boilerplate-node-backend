/**
 * `averageMoney` — an average order value. The subject is rounding to a whole minor unit, and the
 * empty case: no orders is no average, not a division by nothing.
 */
import { NO_MONEY, averageMoney, toMinorUnits } from '@domain-primitives/money';

describe('averageMoney', () => {
    it('shares an amount evenly and rounds half-up to the minor unit', () => {
        expect(averageMoney(toMinorUnits(10, 'EUR'), 4)).toBe(toMinorUnits(2.5, 'EUR'));
        expect(averageMoney(toMinorUnits(10, 'EUR'), 3)).toBe(toMinorUnits(3.33, 'EUR'));
        expect(averageMoney(toMinorUnits(0.05, 'EUR'), 2)).toBe(toMinorUnits(0.03, 'EUR'));
    });

    it('is no money over no orders', () => {
        expect(averageMoney(toMinorUnits(10, 'EUR'), 0)).toBe(NO_MONEY);
    });
});
