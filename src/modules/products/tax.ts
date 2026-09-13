/**
 * @module
 * Resolving a product's tax class into the decimal VAT rate it is actually charged. Lives beside
 * the model rather than in `orders`, since "every product resolves to a rate" is an invariant of
 * the catalogue, not of any one order — `orders` freezes whatever this returns, it does not decide it.
 */

import { vatRateDefault, vatRateReduced } from '@infrastructure/adapters/shop';
import type { Product } from '@types';

/** Mirrors `TaxClass` on the contract — the values a product's `taxClass` may hold. */
export type TaxClass = NonNullable<Product['taxClass']>;

/**
 * The decimal VAT rate a product is charged, from its own `taxClass`. Absent or unrecognized
 * means the shop's standard rate — there is no "no rate" state, which is what lets an order line
 * always freeze a real number rather than an optional one with a hole in it.
 * @param taxClass - the product's own override, or `undefined` for the standard rate
 * @returns the resolved decimal rate (0.22 for 22%)
 */
export const resolveTaxRate = (taxClass?: TaxClass): number => {
    if (taxClass === 'zero') return 0;
    if (taxClass === 'reduced') return vatRateReduced();
    return vatRateDefault();
};
