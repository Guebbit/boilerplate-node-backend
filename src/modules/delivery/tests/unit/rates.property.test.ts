/**
 * @module
 * Property-based tests — `src/modules/delivery/domain/rates.ts`. `rates.test.ts` covers `priceShipping`
 * with three fixed points (below, at, above the threshold); this covers the boundary itself, for
 * every items total rather than the ones someone thought to write down. Seeded, so a counterexample
 * reproduces; any found gets written back as an example in `rates.test.ts`.
 */
import fc from 'fast-check';
import { toDecimalString, toMinorUnits, type Money } from '@domain-primitives/money';
import { PROPERTY_RUNS } from '@tests/knobs';
import {
    findShippingMethod,
    priceShipping,
    methodFitsWeight,
    SHIPPING_METHODS
} from '../../domain/rates';

/** One seed for the file, and one place to change it; the count is `TEST_PROPERTY_RUNS`. */
const RUN = { seed: 20_260_902, numRuns: PROPERTY_RUNS, endOnFailure: true } as const;

/** Any basket value a rate could be asked for — finite and non-negative, nothing else assumed. */
const itemsTotal = () =>
    fc.integer({ min: 0, max: 1e8 }).map((cents) => toDecimalString(cents as Money, 'EUR'));

describe('priceShipping — totality', () => {
    it('never produces NaN or a negative charge, for any items total', () => {
        fc.assert(
            fc.property(fc.constantFrom(...SHIPPING_METHODS), itemsTotal(), (method, total) => {
                const price = Number(priceShipping(method, total, 'EUR'));

                expect(Number.isNaN(price)).toBe(false);
                expect(price).toBeGreaterThanOrEqual(0);
            }),
            RUN
        );
    });

    it("never charges more than the method's own flat rate", () => {
        // The only two answers are the flat rate or free — never a third number.
        fc.assert(
            fc.property(fc.constantFrom(...SHIPPING_METHODS), itemsTotal(), (method, total) => {
                expect(Number(priceShipping(method, total, 'EUR'))).toBeLessThanOrEqual(
                    Number(method.price)
                );
            }),
            RUN
        );
    });
});

describe('priceShipping — the free-shipping threshold', () => {
    it('is free at and above the threshold, for a method that has one', () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 1e6 }), (aboveBy) => {
                const standard = findShippingMethod('standard')!;
                const threshold = toMinorUnits(standard.freeAbove!, 'EUR');

                expect(
                    priceShipping(
                        standard,
                        toDecimalString((threshold + aboveBy) as Money, 'EUR'),
                        'EUR'
                    )
                ).toBe('0.00');
            }),
            RUN
        );
    });

    it('charges the flat rate anywhere strictly below the threshold', () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 1e4 }), (belowBy) => {
                const standard = findShippingMethod('standard')!;
                const threshold = toMinorUnits(standard.freeAbove!, 'EUR');

                expect(
                    priceShipping(
                        standard,
                        toDecimalString((threshold - belowBy) as Money, 'EUR'),
                        'EUR'
                    )
                ).toBe(standard.price);
            }),
            RUN
        );
    });

    it('never waives a method that has no threshold, at any total', () => {
        fc.assert(
            fc.property(itemsTotal(), (total) => {
                const express = findShippingMethod('express')!;

                expect(priceShipping(express, total, 'EUR')).toBe(express.price);
            }),
            RUN
        );
    });
});

describe('methodFitsWeight — the declared range holds both ways', () => {
    it('fits exactly the [minWeight, maxWeight] range each method declares, nothing either side of it', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...SHIPPING_METHODS),
                fc.integer({ min: 0, max: 1e6 }),
                (method, weight) => {
                    const fits = methodFitsWeight(method, weight);
                    const belowFloor = method.minWeight !== undefined && weight < method.minWeight;
                    const aboveCeiling =
                        method.maxWeight !== undefined && weight > method.maxWeight;

                    expect(fits).toBe(!belowFloor && !aboveCeiling);
                }
            ),
            RUN
        );
    });
});
