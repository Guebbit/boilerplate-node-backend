/**
 * `minMoney` — the smaller of some amounts, as `Money` and with no cast at the call site.
 */
import { minMoney, toMinorUnits } from '@domain-primitives/money';

describe('minMoney', () => {
    it('answers the smallest amount', () => {
        const small = toMinorUnits(2.5, 'EUR');
        const big = toMinorUnits(10, 'EUR');

        expect(minMoney(big, small)).toBe(small);
        expect(minMoney(small, big)).toBe(small);
        expect(minMoney(big, big, small)).toBe(small);
    });

    it('answers the amount itself when it is the only one', () => {
        const only = toMinorUnits(7, 'EUR');

        expect(minMoney(only)).toBe(only);
    });
});
