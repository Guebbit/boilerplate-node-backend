/**
 * `persistence/money-field` — the pure half of money at rest: reading a stored `Decimal128` back as decimal
 * text, however deep it sits. The database half is the integration test of the same name.
 */
import { Types } from 'mongoose';
import { decimalToString, padMoneyPaths, stringifyDecimals } from '@infrastructure/persistence/money-field';

describe('decimalToString', () => {
    it('reads a Decimal128 by its text', () => {
        expect(decimalToString(Types.Decimal128.fromString('19.99'))).toBe('19.99');
        expect(decimalToString(Types.Decimal128.fromString('0.30'))).toBe('0.30');
    });

    it('spells a number as text and calls anything else absent', () => {
        expect(decimalToString(4)).toBe('4');
        expect(decimalToString(undefined)).toBeUndefined();
        expect(decimalToString(null)).toBeUndefined();
        expect(decimalToString('19.99')).toBe('19.99');
    });
});

describe('stringifyDecimals', () => {
    it('replaces every Decimal128 in a nested document, in place', () => {
        const document = {
            price: Types.Decimal128.fromString('5.50'),
            items: [{ product: { price: Types.Decimal128.fromString('1.10') }, quantity: 2 }],
            title: 'x'
        };

        const revived = stringifyDecimals(document);

        expect(revived).toBe(document);
        expect(document).toEqual({
            price: '5.50',
            items: [{ product: { price: '1.10' }, quantity: 2 }],
            title: 'x'
        });
    });

    it('returns a bare Decimal128 as text', () => {
        expect(stringifyDecimals(Types.Decimal128.fromString('2.25'))).toBe('2.25');
    });

    it('leaves ids, dates and scalars as they are', () => {
        const id = new Types.ObjectId();
        const at = new Date();
        const document = { id, at, n: 3, nothing: null };

        stringifyDecimals(document);

        expect(document.id).toBe(id);
        expect(document.at).toBe(at);
        expect(document).toMatchObject({ n: 3, nothing: null });
    });
});

describe('padMoneyPaths', () => {
    it.each([
        ['EUR', '19.9', '19.90'],
        ['JPY', '1000', '1000'],
        ['JPY', '1000.00', '1000'],
        ['KWD', '1.5', '1.500']
    ])('spells %s %s at the currency\'s own places as %s', (currency, stored, expected) => {
        const row = { total: stored, items: [{ price: stored }, { price: stored }], note: stored };

        padMoneyPaths(row, ['total', 'items.price'], currency);

        expect(row).toEqual({
            total: expected,
            items: [{ price: expected }, { price: expected }],
            // Only the named paths are money.
            note: stored
        });
    });

    it('leaves an absent amount absent', () => {
        const row: Record<string, unknown> = { items: [{}] };

        padMoneyPaths(row, ['total', 'items.price'], 'EUR');

        expect(row).toEqual({ items: [{}] });
    });
});
