/**
 * @module
 * Shipping rates — pure functions over a static table, kept in `domain/` like `evaluateCheckout`
 * so quotes come from exactly one place. `ShippingMethod` is this module's own `openapi.yaml`
 * schema, since `GET /delivery/methods` answers this table verbatim.
 * See `docs/theory/domain-layer.md`.
 */

import type { ShippingMethod } from '@types';

/**
 * The methods this shop offers. Flat rates on purpose — weight/zone matrices are real-project
 * concerns with no demo value. `pickup` proves "cheapest method" and "no method" stay distinct.
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
 * @param method - the chosen method
 * @param itemsTotal - the order's lines total, compared against `freeAbove`
 * @returns the cost — `0` once the threshold is met, the flat rate otherwise
 */
export const priceShipping = (method: ShippingMethod, itemsTotal: number): number =>
    method.freeAbove !== undefined && itemsTotal >= method.freeAbove ? 0 : method.price;
