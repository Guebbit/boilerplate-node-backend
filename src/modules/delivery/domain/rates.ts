/**
 * @module
 * Shipping rates — pure functions over a static table, kept in `domain/` like `evaluateCheckout`
 * so quotes come from exactly one place. `ShippingMethod` is this module's own `openapi.yaml`
 * schema, since `GET /delivery/methods` answers this table verbatim.
 * See `docs/theory/domain-layer.md`.
 */

import { padDecimal, toDecimalString, toMinorUnits, type Money } from '@domain-primitives/money';
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
 * tracked:         whether the carrier gives a code the buyer can follow (it may be added
 *                  after the shipment left) — only `express` is worth the carrier's own visibility.
 * requiresAddress: whether checkout demands an address — `pickup` ships nowhere, so it needs none.
 */
export const SHIPPING_METHODS: readonly StaticShippingMethod[] = [
    {
        id: 'standard',
        price: '5.00',
        freeAbove: '100.00',
        tracked: false,
        maxWeight: 30_000,
        requiresAddress: true
    },
    {
        id: 'express',
        price: '15.00',
        tracked: true,
        maxWeight: 5000,
        requiresAddress: true
    },
    { id: 'pickup', price: '0.00', tracked: false, requiresAddress: false }
];

/** The method behind an id, or undefined — the caller decides what absence answers. */
export const findShippingMethod = (methodId: string): StaticShippingMethod | undefined =>
    SHIPPING_METHODS.find(({ id }) => id === methodId);

/**
 * What a method costs against a given items total, in minor units of `currency`. The table is
 * written in decimal text; compared and added only as minor units, so `"100"` and `"100.00"` agree.
 * @param method - the chosen method
 * @param itemsTotal - the order's lines total, compared against `freeAbove`
 * @param currency - the ISO-4217 code `itemsTotal` and the table are priced in
 * @returns the cost — nothing once the threshold is met, the flat rate otherwise
 */
const priceShippingMoney = (
    method: StaticShippingMethod,
    itemsTotal: string,
    currency: string
): Money =>
    method.freeAbove !== undefined &&
    toMinorUnits(itemsTotal, currency) >= toMinorUnits(method.freeAbove, currency)
        ? toMinorUnits(0, currency)
        : toMinorUnits(method.price, currency);

/**
 * {@link priceShippingMoney}, spelled as the wire's decimal text.
 * @param method - the chosen method
 * @param itemsTotal - the order's lines total, compared against `freeAbove`
 * @param currency - the ISO-4217 code `itemsTotal` and the table are priced in
 * @returns the cost as decimal text at the currency's places
 */
export const priceShipping = (
    method: StaticShippingMethod,
    itemsTotal: string,
    currency: string
): string => toDecimalString(priceShippingMoney(method, itemsTotal, currency), currency);

/**
 * A table row as the wire shows it: prices at `currency`'s own places, and the currency itself.
 * @param method - a row of the static table
 * @param currency - the shop's live ISO-4217 code
 * @returns the method with `price`/`freeAbove` padded to the currency
 */
export const quoteMethod = (method: StaticShippingMethod, currency: string): ShippingMethod => ({
    ...method,
    price: padDecimal(method.price, currency),
    ...(method.freeAbove === undefined
        ? {}
        : { freeAbove: padDecimal(method.freeAbove, currency) }),
    currency
});

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

/**
 * What the cheapest STANDARD delivery would have cost against an items total — the ceiling on
 * what a withdrawal refunds of the shipping paid (Consumer Rights Directive Art. 13(2): a
 * surcharge over the cheapest standard delivery the trader offers is not refunded).
 *
 * Only methods that deliver count: `requiresAddress: false` (`pickup`) is collection, not
 * delivery, and would otherwise always win at zero. On an order big enough for standard to be free
 * the answer is zero, so a paid express upgrade stays entirely with the shop.
 *
 * @param itemsTotal - the order's lines total
 * @param currency - the ISO-4217 code `itemsTotal` is priced in
 * @returns the cheapest delivery price on offer, or `0` when nothing delivers at all
 */
export const cheapestStandardShipping = (itemsTotal: string, currency: string): string => {
    const prices = SHIPPING_METHODS.filter(({ requiresAddress }) => requiresAddress).map((method) =>
        priceShippingMoney(method, itemsTotal, currency)
    );
    return toDecimalString(prices.length > 0 ? (Math.min(...prices) as Money) : toMinorUnits(0, currency), currency);
};
