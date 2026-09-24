/**
 * @module
 * Shipping rates — `src/modules/delivery/domain/rates.ts`. Pure functions over a static table:
 * no mocks, no database. `service.test.ts` lives in `tests/integration/` instead, since it needs
 * a real database to prove a shipment persists; the pricing rule itself does not, and belongs here.
 */

import {
    findShippingMethod,
    priceShipping,
    methodFitsWeight,
    methodsForWeight,
    SHIPPING_METHODS
} from '../../domain/rates';

describe('findShippingMethod', () => {
    it('finds a method by id', () => {
        expect(findShippingMethod('express')).toEqual({
            id: 'express',
            price: 15,
            tracked: true,
            maxInsuredValue: 500,
            maxWeight: 5000
        });
    });

    it('returns undefined for an id this shop does not offer', () => {
        expect(findShippingMethod('overnight')).toBeUndefined();
    });
});

describe('priceShipping', () => {
    it('charges the flat rate below the free-shipping threshold', () => {
        const standard = findShippingMethod('standard')!;

        expect(priceShipping(standard, 99)).toBe(5);
    });

    it('is free once the items total reaches the threshold', () => {
        const standard = findShippingMethod('standard')!;

        expect(priceShipping(standard, 100)).toBe(0);
        expect(priceShipping(standard, 150)).toBe(0);
    });

    it('charges the flat rate regardless of total when the method has no threshold', () => {
        const express = findShippingMethod('express')!;

        expect(priceShipping(express, 0)).toBe(15);
        expect(priceShipping(express, 1_000_000)).toBe(15);
    });

    it('prices pickup at zero, distinct from "no method"', () => {
        const pickup = findShippingMethod('pickup')!;

        expect(priceShipping(pickup, 0)).toBe(0);
    });
});

describe('methodFitsWeight', () => {
    it('fits any weight when the method names no range', () => {
        const pickup = findShippingMethod('pickup')!;

        expect(methodFitsWeight(pickup, 0)).toBe(true);
        expect(methodFitsWeight(pickup, 1_000_000)).toBe(true);
    });

    it('refuses a basket over the method’s maxWeight', () => {
        const express = findShippingMethod('express')!;

        expect(methodFitsWeight(express, 5000)).toBe(true);
        expect(methodFitsWeight(express, 5001)).toBe(false);
    });

    it('refuses a basket under the method’s minWeight', () => {
        // No shipped method actually declares one today — proven against a value built
        // in-line, not `SHIPPING_METHODS`, so this rule stays covered either way.
        expect(
            methodFitsWeight({ id: 'heavy', price: 0, tracked: false, minWeight: 1000 }, 999)
        ).toBe(false);
        expect(
            methodFitsWeight({ id: 'heavy', price: 0, tracked: false, minWeight: 1000 }, 1000)
        ).toBe(true);
    });
});

describe('methodsForWeight', () => {
    it('returns every method when no weight is given', () => {
        expect(methodsForWeight(undefined)).toEqual(SHIPPING_METHODS);
    });

    it('excludes a method a heavy basket does not fit', () => {
        // Over express's 5000g ceiling, under standard's 30000g one, pickup has no ceiling.
        const methods = methodsForWeight(10_000).map(({ id }) => id);

        expect(methods).toEqual(['standard', 'pickup']);
    });

    it('excludes every method with a ceiling once the basket clears all of them', () => {
        const methods = methodsForWeight(40_000).map(({ id }) => id);

        expect(methods).toEqual(['pickup']);
    });
});

describe('SHIPPING_METHODS', () => {
    it('gives every method a non-negative price', () => {
        // The table this shop quotes from is committed data, not user input — this is the canary
        // for a typo that would otherwise only surface as a wrong number at checkout.
        for (const method of SHIPPING_METHODS) expect(method.price).toBeGreaterThanOrEqual(0);
    });

    it('gives every method a real boolean tracked flag', () => {
        // The shipping door reads this to decide whether a code is required — an accidentally
        // missing flag here would surface as `undefined` there, not a clean refusal.
        for (const method of SHIPPING_METHODS) expect(typeof method.tracked).toBe('boolean');
    });
});
