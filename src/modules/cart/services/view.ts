/**
 * @module
 * The cart projection — how a stored cart becomes something a caller can read.
 *
 * Internal to `services/`; the other three files share these helpers and none of them owns it.
 *
 * A cart is its own document keyed by `userId` (`../model`), so every operation is one addressed
 * write or read. Absence and emptiness are the same state: no cart document answers as an empty
 * cart, never a 404.
 */

import { orderTotal, sumLineItems, shopCurrency } from '@modules/orders';
import { productService } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { Lean } from '@infrastructure/persistence/create-repository';
import type { CartItem, CartShipping } from '@types';
import {
    SHIPPING_METHODS,
    methodFitsWeight,
    priceShipping,
    type StaticShippingMethod
} from '@modules/delivery';
import type { CartDocument } from '../model';
import { basketWeight, needsShipping } from '../domain';

/**
 * A cart line joined with the product it references.
 * `productId` and `product` are separate fields on purpose: {@link readCartLines} joins by a
 * separate `productService.findManyByIds` lookup rather than a Mongoose `populate()` — cart
 * reaches products through its service, not its collection (`docs/theory/strategic-ddd.md` §5) —
 * so the id it looked the product up by is kept alongside the result rather than overwritten.
 */
export interface CartLine extends CartItem {
    /** The joined product, or `null` for an id that resolves to nothing. */
    product: Lean<ProductDocument> | null;
}

/** A cart line whose reference resolved — what an order may be built from. */
export type JoinedCartLine = CartLine & { product: Lean<ProductDocument> };

/**
 * The cart as `openapi.yaml` declares it: `CartResponse`, built rather than serialized.
 *
 * Every cart endpoint answers with this — the reads directly, the mutations as their payload —
 * which is why no controller has to re-read the cart after changing it.
 */
export interface CartView {
    items: CartItem[];
    summary: {
        itemsCount: number;
        totalQuantity: number;
        itemsTotal: number;
        shippingCost: number;
        totalPrice: number;
        currency: string;
    };
    /** What this basket needs from shipping, and what it may choose from — see {@link shippingFor}. */
    shipping: CartShipping;
}

/** Narrow a line to one whose product actually exists. */
export const isJoined = (line: CartLine): line is JoinedCartLine => line.product !== null;

/**
 * Join a cart's lines to their products, in one query.
 *
 * `productService.findManyByIds` is unscoped, the same as the `populate()` it replaces: a
 * soft-deleted or deactivated product still joins, `active`/`deletedAt` included, which is what
 * lets checkout tell "gone" (hard-deleted, absent from the lookup) from "here, but not sellable"
 * apart. One `$in` query for however many lines the cart holds, same shape as
 * `orders/services/current.ts`'s own catalogue join.
 */
export const readCartLines = (cart: CartDocument | null): Promise<CartLine[]> => {
    if (!cart) return Promise.resolve([]);

    // No `items = []` fallback: the schema defaults the array, so a hydrated cart always has one.
    const productIds = cart.items.map(({ productId }) => productId.toString());

    return productService.findManyByIds(productIds).then((products) => {
        const byId = new Map(products.map((product) => [String(product._id), product]));

        return cart.items.map(({ productId, quantity }) => ({
            productId: productId.toString(),
            quantity,
            product: byId.get(productId.toString()) ?? null
        }));
    });
};

/**
 * What a shipping method costs this basket: the flat rate, or nothing once the basket's whole
 * items total reaches the method's `freeAbove`. Every line counts, digital ones included (the
 * Shopify and WooCommerce rule), and the cart's quote and checkout's charge both come from here so
 * they cannot disagree.
 *
 * @param method - the method being priced
 * @param lines - the basket's lines, cart lines or an order's frozen ones
 * @param currency - the ISO-4217 code the lines are priced in
 */
export const shippingPriceFor = (
    method: StaticShippingMethod,
    lines: Parameters<typeof sumLineItems>[0],
    currency: string
): number => priceShipping(method, sumLineItems(lines, currency).price);

/**
 * What this basket needs from shipping, and every method that currently fits it, each priced
 * through {@link shippingPriceFor} — so this list and what checkout would charge can never
 * disagree. Empty options for a basket that needs no shipping at all: `CART_SHIPPING_NOT_APPLICABLE`
 * is what `cartShippingMethodSet` refuses a choice with in that case, so nothing here would ever be
 * a legal pick.
 * @param joined - the basket's lines, already narrowed to ones whose product resolved
 * @returns the fitting, priced options, and whether choosing one is required at all
 */
export const shippingOptionsFor = (
    joined: JoinedCartLine[]
): Pick<CartShipping, 'required' | 'options'> => {
    if (!needsShipping(joined)) return { required: false, options: [] };

    const weight = basketWeight(joined);
    const currency = shopCurrency();
    const options = SHIPPING_METHODS.filter((method) => methodFitsWeight(method, weight)).map(
        (method) => ({
            id: method.id,
            price: shippingPriceFor(method, joined, currency),
            requiresAddress: method.requiresAddress,
            tracked: method.tracked
        })
    );
    return { required: true, options };
};

/**
 * The method a cart's stored choice actually stands for. A choice that is not among the basket's
 * fitting options counts as none: the basket may have gone digital-only, lost its last physical
 * line or outgrown the method since it was set. The one rule the cart's view and checkout share.
 *
 * @param stored - the id stored on the cart, if any
 * @param options - the basket's fitting options, from {@link shippingOptionsFor}
 * @returns the stored id when it still fits, otherwise `null`
 */
export const effectiveShippingChoice = (
    stored: string | undefined,
    options: CartShipping['options']
): string | null =>
    stored !== undefined && options.some((option) => option.id === stored) ? stored : null;

/**
 * Turn a cart document into the response the contract declares.
 * The joined `product` prices the cart, then is dropped: `CartItem` in `openapi.yaml` is
 * `additionalProperties: false` over `{ productId, quantity }`. Use `cartGet` where the joined
 * product is actually needed.
 */
export const toCartView = (cart: CartDocument | null): Promise<CartView> =>
    readCartLines(cart).then((lines) => {
        // A cart never freezes a currency of its own — it hasn't checked out — so it always
        // prices against the shop's CURRENT setting, unlike an order's frozen `orderCurrency`.
        const currency = shopCurrency();
        const { count, quantity, price } = sumLineItems(lines, currency);
        const joined = lines.filter((line) => isJoined(line));
        const { required, options } = shippingOptionsFor(joined);
        const selected = effectiveShippingChoice(cart?.shippingMethodId, options);
        const shippingCost = options.find((option) => option.id === selected)?.price ?? 0;
        return {
            items: lines.map(({ productId, quantity: lineQuantity }) => ({
                productId,
                quantity: lineQuantity
            })),
            summary: {
                itemsCount: count,
                totalQuantity: quantity,
                itemsTotal: price,
                shippingCost,
                // The order and the payment intent total in minor units; adding the two decimals here
                // would show 5.5600000000000005 for a basket that is charged 5.56.
                totalPrice: orderTotal({ items: lines, shippingCost, currency }),
                currency
            },
            shipping: { required, selected, options }
        };
    });
