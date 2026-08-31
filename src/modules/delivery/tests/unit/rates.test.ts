/**
 * @module
 * Shipping rates — `src/modules/delivery/domain/rates.ts`.
 *
 * Pure functions over a static table: no mocks, no database. `service.test.ts` moved to
 * `tests/integration/` because it needs a real database to prove a shipment persists; the pricing
 * rule itself does not, and belongs here so the module keeps genuine unit coverage.
 */

import { findShippingMethod, priceShipping, SHIPPING_METHODS } from '../../domain/rates';

describe('findShippingMethod', () => {
    it('finds a method by id', () => {
        expect(findShippingMethod('express')).toEqual({ id: 'express', price: 15 });
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

describe('SHIPPING_METHODS', () => {
    it('gives every method a non-negative price', () => {
        // The table this shop quotes from is committed data, not user input — this is the canary
        // for a typo that would otherwise only surface as a wrong number at checkout.
        for (const method of SHIPPING_METHODS) expect(method.price).toBeGreaterThanOrEqual(0);
    });
});
