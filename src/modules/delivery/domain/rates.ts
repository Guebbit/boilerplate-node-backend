/**
 * @module
 * Shipping rates — the one piece of delivery that is a rule rather than a record.
 *
 * Pure functions over a static table, in `domain/` like `evaluateCheckout`: quotes must come
 * from exactly one place, and a table this small doesn't deserve a collection. Real carrier
 * rates would replace the table — checkout only ever sees `priceShipping`.
 *
 * `ShippingMethod` is `delivery`'s own `openapi.yaml` schema, imported rather than restated,
 * since `GET /delivery/methods` answers this table verbatim.
 *
 * See `docs/theory/domain-layer.md`.
 */

import type { ShippingMethod } from '@types';

/**
 * The methods this shop offers.
 *
 * Flat rates on purpose: weight/zone matrices are real-project concerns with no demo value.
 * `pickup` is the zero-cost proof that "cheapest method" and "no method" stay distinguishable.
 */
export const SHIPPING_METHODS: readonly ShippingMethod[] = [
    { id: 'standard', price: 5, freeAbove: 100 },
    { id: 'express', price: 15 },
    { id: 'pickup', price: 0 }
];

/** The method behind an id, or undefined — the caller decides what absence answers. */
export const findShippingMethod = (methodId: string): ShippingMethod | undefined =>
    SHIPPING_METHODS.find(({ id }) => id === methodId);

/**
 * What a method costs against a given items total.
 *
 * @param method - the chosen method
 * @param itemsTotal - the order's lines total, the number `freeAbove` compares against
 * @returns the cost — `0` once the threshold is met, the flat rate otherwise
 */
export const priceShipping = (method: ShippingMethod, itemsTotal: number): number =>
    method.freeAbove !== undefined && itemsTotal >= method.freeAbove ? 0 : method.price;
