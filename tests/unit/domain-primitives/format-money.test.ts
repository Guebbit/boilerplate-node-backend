/**
 * `formatMoney`: the places come from the pinned ISO 4217 table, not the runtime's CLDR data.
 */

import { formatMoney } from '@domain-primitives/money';

describe('formatMoney', () => {
    it('writes a two-place currency with two places', () => {
        expect(formatMoney('en', 19.9, 'EUR')).toBe('€19.90');
    });

    it('writes a zero-place currency with none', () => {
        expect(formatMoney('en', 1500, 'JPY')).toBe('¥1,500');
    });

    it('writes a three-place currency with three', () => {
        expect(formatMoney('en', 1.5, 'KWD')).toBe('KWD\u00A01.500');
    });

    it('follows the pinned table where CLDR disagrees: IQD keeps its three places', () => {
        expect(formatMoney('en', 1000, 'IQD')).toBe('IQD\u00A01,000.000');
    });

    it('spells money the way the locale writes it', () => {
        expect(formatMoney('it', 12_345.5, 'EUR')).toBe('12.345,50 €');
    });
});
