/**
 * @module
 * Shipping rates — pure functions over a static table, kept in `domain/` like `evaluateCheckout`
 * so quotes come from exactly one place. `ShippingMethod` is this module's own `openapi.yaml`
 * schema, since `GET /delivery/methods` answers this table verbatim.
 * See `docs/theory/domain-layer.md`.
 */

import type { ShippingMethod } from '@types';

/**
 * The methods this shop offers. Flat rates on purpose — a full zone matrix is a real-project
 * concern with no demo value; the weight range each method accepts is the one dimension worth
 * demonstrating, since it is what keeps a carrier's own limits honest. `pickup` proves "cheapest
 * method" and "no method" stay distinct, and carries no weight ceiling — nothing about a counter
 * collection cares how heavy the box is. `tracked` decides whether
 * `POST /delivery/order/{orderId}/ship` requires a tracking code — `express` is the one method
 * worth the carrier's own visibility; `standard` and `pickup` are not.
 */
export const SHIPPING_METHODS: readonly ShippingMethod[] = [
    { id: 'standard', price: 5, freeAbove: 100, tracked: false, maxWeight: 30_000 },
    { id: 'express', price: 15, tracked: true, maxInsuredValue: 500, maxWeight: 5000 },
    { id: 'pickup', price: 0, tracked: false }
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

/**
 * Whether a basket of the given weight is within a method's declared range. Absent
 * `minWeight`/`maxWeight` is an open bound on that side, not zero — a method naming neither
 * fits any weight.
 * @param method - the method being checked
 * @param weight - the basket's total weight in grams (0 for a basket with nothing weighed)
 */
export const methodFitsWeight = (method: ShippingMethod, weight: number): boolean =>
    (method.minWeight === undefined || weight >= method.minWeight) &&
    (method.maxWeight === undefined || weight <= method.maxWeight);

/**
 * The methods that fit a given basket weight — `SHIPPING_METHODS` itself when `weight` is
 * omitted, since an unknown weight excludes nothing.
 * @param weight - the basket's total weight in grams, or `undefined` to skip filtering
 */
export const methodsForWeight = (weight?: number): readonly ShippingMethod[] =>
    weight === undefined
        ? SHIPPING_METHODS
        : SHIPPING_METHODS.filter((method) => methodFitsWeight(method, weight));
