/**
 * @module
 * Property-based tests — `src/modules/delivery/domain/rates.ts`. `rates.test.ts` covers `priceShipping`
 * with three fixed points (below, at, above the threshold); this covers the boundary itself, for
 * every items total rather than the ones someone thought to write down. Seeded, so a counterexample
 * reproduces; any found gets written back as an example in `rates.test.ts`.
 */
import fc from 'fast-check';
import { findShippingMethod, priceShipping, SHIPPING_METHODS } from '../../domain/rates';

/** One seed for the file, and one place to change it. */
const RUN = { seed: 20_260_902, numRuns: 300, endOnFailure: true } as const;

const itemsTotal = () => fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e6 });

describe('priceShipping — totality', () => {
    it('never produces NaN or a negative charge, for any items total', () => {
        fc.assert(
            fc.property(fc.constantFrom(...SHIPPING_METHODS), itemsTotal(), (method, total) => {
                const price = priceShipping(method, total);

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
                expect(priceShipping(method, total)).toBeLessThanOrEqual(method.price);
            }),
            RUN
        );
    });
});

describe('priceShipping — the free-shipping threshold', () => {
    it('is free at and above the threshold, for a method that has one', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 1e6 }).map((cents) => cents / 100),
                (aboveBy) => {
                    const standard = findShippingMethod('standard')!;
                    const threshold = standard.freeAbove!;

                    expect(priceShipping(standard, threshold + aboveBy)).toBe(0);
                }
            ),
            RUN
        );
    });

    it('charges the flat rate anywhere strictly below the threshold', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 1e6 }).map((cents) => cents / 100),
                (belowBy) => {
                    const standard = findShippingMethod('standard')!;
                    const threshold = standard.freeAbove!;

                    fc.pre(belowBy > 0);
                    expect(priceShipping(standard, threshold - belowBy)).toBe(standard.price);
                }
            ),
            RUN
        );
    });

    it('never waives a method that has no threshold, at any total', () => {
        fc.assert(
            fc.property(itemsTotal(), (total) => {
                const express = findShippingMethod('express')!;

                expect(priceShipping(express, total)).toBe(express.price);
            }),
            RUN
        );
    });
});
