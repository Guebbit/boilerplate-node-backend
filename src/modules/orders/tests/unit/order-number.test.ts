/**
 * @module
 * `parseOrderNumber`: the number as a customer quotes it, read back into the stored form.
 */
import { parseOrderNumber } from '../../services/order-numbering';

describe('parseOrderNumber', () => {
    it.each([
        ['2026-000041', '2026-000041'],
        [' 2026-000041 ', '2026-000041'],
        ['#2026-000041', '2026-000041'],
        ['# 2026-41', '2026-000041'],
        ['2026-41', '2026-000041'],
        ['2026-0', '2026-000000']
    ])('reads %j as %s', (raw, canonical) => {
        expect(parseOrderNumber(raw)).toBe(canonical);
    });

    it.each(['', '41', '#', '26-41', '2026-', '2026-4x', '2026/41', '2026-1234567890', 'abc'])(
        'refuses %j',
        (raw) => {
            expect(parseOrderNumber(raw)).toBeUndefined();
        }
    );
});
