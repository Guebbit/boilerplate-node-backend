/**
 * @module
 * Who sees the exact stock counters: only a caller holding `inventory.any.read`, read as the
 * literal key. `redactStock` takes the counters away and leaves the flags and the row's version.
 */
import { callerAs, strangerCaller } from '@tests/callers';
import { versionOf } from '@infrastructure/persistence/versioning';
import type { Product } from '@types';
import { canSeeStock, redactStock } from '../../services/stock-view';

/** A wire product, counters included. */
const product: Product = {
    id: 'p1',
    title: 'Desk',
    price: 10,
    currency: 'EUR',
    inStock: true,
    lowStock: false,
    onHand: 12,
    reserved: 2,
    available: 10
};

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

describe('redactStock', () => {
    it('leaves a stock reader’s product exactly as it is', () => {
        expect(redactStock(product, true)).toBe(product);
    });

    it('drops the three counters for everyone else, and keeps the flags and the rest', () => {
        const redacted = redactStock(product, false);

        expect(redacted).toEqual({
            id: 'p1',
            title: 'Desk',
            price: 10,
            currency: 'EUR',
            inStock: true,
            lowStock: false
        });
    });

    it('does not touch the product it was handed', () => {
        redactStock(product, false);

        expect(product.onHand).toBe(12);
    });

    it('hands the row’s version to the copy, so the ETag survives', () => {
        const versioned = { ...product, editRevision: 4 };

        expect(versionOf(redactStock(versioned, false))).toBe(4);
    });
});
