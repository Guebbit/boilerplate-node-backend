/**
 * @module
 * The cheapest standard shipping rate. (The return address moved to `orders`; its tests are in
 * `orders/tests/unit/config.test.ts`.)
 */
import { cheapestStandardShipping } from '../../domain';

describe('cheapestStandardShipping', () => {
    it('is the flat standard rate on a small order — pickup is collection, not delivery', () => {
        expect(cheapestStandardShipping(50)).toBe(5);
    });

    it('is zero once standard is free', () => {
        expect(cheapestStandardShipping(100)).toBe(0);
        expect(cheapestStandardShipping(150)).toBe(0);
    });
});
