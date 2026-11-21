/**
 * @module
 * Who sees the exact stock counters: only a caller holding `read:StockLevel`, read as the
 * literal key.
 */
import { callerAs, strangerCaller } from '@tests/callers';
import { canSeeStock } from '../../services/stock-view';

describe('canSeeStock', () => {
    it.each([
        ['manager', true],
        ['warehouse', true],
        ['admin', true],
        // Every product key, none of the stock one.
        ['editor', false],
        ['support', false],
        ['customer', false],
        ['unverified', false]
    ])('answers %s: %j', (role, expected) => {
        expect(canSeeStock(callerAs(role))).toBe(expected);
    });

    it('answers no for a stranger and for no caller at all', () => {
        expect(canSeeStock(strangerCaller())).toBe(false);
        expect(canSeeStock(undefined)).toBe(false);
    });
});
