/**
 * `persistence/money-field` — the pure half of money at rest: reading a stored `Decimal128` back as a
 * number, however deep it sits. The database half is the integration test of the same name.
 */
import { Types } from 'mongoose';
import { decimalToNumber, reviveDecimals } from '@infrastructure/persistence/money-field';

describe('decimalToNumber', () => {
    it('reads a Decimal128 by its text', () => {
        expect(decimalToNumber(Types.Decimal128.fromString('19.99'))).toBe(19.99);
        expect(decimalToNumber(Types.Decimal128.fromString('0.30'))).toBe(0.3);
    });

    it('passes a number through and calls anything else absent', () => {
        expect(decimalToNumber(4)).toBe(4);
        expect(decimalToNumber(undefined)).toBeUndefined();
        expect(decimalToNumber(null)).toBeUndefined();
        expect(decimalToNumber('19.99')).toBeUndefined();
    });
});

describe('reviveDecimals', () => {
    it('replaces every Decimal128 in a nested document, in place', () => {
        const document = {
            price: Types.Decimal128.fromString('5.50'),
            items: [{ product: { price: Types.Decimal128.fromString('1.10') }, quantity: 2 }],
            title: 'x'
        };

        const revived = reviveDecimals(document);

        expect(revived).toBe(document);
        expect(document).toEqual({
            price: 5.5,
            items: [{ product: { price: 1.1 }, quantity: 2 }],
            title: 'x'
        });
    });

    it('returns a bare Decimal128 as a number', () => {
        expect(reviveDecimals(Types.Decimal128.fromString('2.25'))).toBe(2.25);
    });

    it('leaves ids, dates and scalars as they are', () => {
        const id = new Types.ObjectId();
        const at = new Date();
        const document = { id, at, n: 3, nothing: null };

        reviveDecimals(document);

        expect(document.id).toBe(id);
        expect(document.at).toBe(at);
        expect(document).toMatchObject({ n: 3, nothing: null });
    });
});
