/**
 * @module
 * Shipping rates — pure functions over a static table, kept in `domain/` like `evaluateCheckout`
 * so quotes come from exactly one place. `ShippingMethod` is this module's own `openapi.yaml`
 * schema, since `GET /delivery/methods` answers this table verbatim.
 * See `docs/theory/domain-layer.md`.
 */

import type { ShippingMethod } from '@types';

/**
 * A shipping method as the static rate table declares it — everything `ShippingMethod` has
 * except `currency`, which is live deployment config (`NODE_DEFAULT_CURRENCY`) that
 * `service.ts`'s `listMethods` stamps on per call, never baked into a table built once at import.
 */
export type StaticShippingMethod = Omit<ShippingMethod, 'currency'>;

/**
 * The methods this shop offers. Flat rates on purpose — a full zone matrix is a real-project
 * concern with no demo value. `pickup` proves "cheapest method" and "no method" stay distinct.
 *
 * Weight range:    the one dimension worth demonstrating — it keeps a carrier's limits honest.
 *                  `pickup` has no ceiling: a counter collection doesn't care how heavy the box is.
 * tracked:         whether `POST /delivery/order/{orderId}/ship` requires a tracking code — only
 *                  `express` is worth the carrier's own visibility.
 * requiresAddress: whether checkout demands an address — `pickup` ships nowhere, so it needs none.
 */
export const SHIPPING_METHODS: readonly StaticShippingMethod[] = [
    {
        id: 'standard',
        price: 5,
        freeAbove: 100,
        tracked: false,
        maxWeight: 30_000,
        requiresAddress: true
    },
    {
        id: 'express',
        price: 15,
        tracked: true,
        maxInsuredValue: 500,
        maxWeight: 5000,
        requiresAddress: true
    },
    { id: 'pickup', price: 0, tracked: false, requiresAddress: false }
];

/** The method behind an id, or undefined — the caller decides what absence answers. */
export const findShippingMethod = (methodId: string): StaticShippingMethod | undefined =>
    SHIPPING_METHODS.find(({ id }) => id === methodId);

/**
 * What a method costs against a given items total.
 * @param method - the chosen method
 * @param itemsTotal - the order's lines total, compared against `freeAbove`
 * @returns the cost — `0` once the threshold is met, the flat rate otherwise
 */
export const priceShipping = (method: StaticShippingMethod, itemsTotal: number): number =>
    method.freeAbove !== undefined && itemsTotal >= method.freeAbove ? 0 : method.price;

/**
 * Whether a basket of the given weight is within a method's declared range. Absent
 * `minWeight`/`maxWeight` is an open bound on that side, not zero — a method naming neither
 * fits any weight.
 * @param method - the method being checked
 * @param weight - the basket's total weight in grams (0 for a basket with nothing weighed)
 */
export const methodFitsWeight = (method: StaticShippingMethod, weight: number): boolean =>
    (method.minWeight === undefined || weight >= method.minWeight) &&
    (method.maxWeight === undefined || weight <= method.maxWeight);
