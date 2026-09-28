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

import { sumLineItems, shopCurrency } from '@modules/orders';
import { productService } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import type { Lean } from '@infrastructure/persistence/create-repository';
import type { CartItem } from '@types';
import { findShippingMethod, methodFitsWeight, priceShipping } from '@modules/delivery';
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
    /** The cart's chosen shipping method (`PUT /cart/shipping-method`), or `undefined` for none. */
    shippingMethodId?: string;
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
 * What shipping would cost the cart's basket right now, at the method it has chosen — `0` for no
 * method chosen, a digital-only basket (shipping never applies), or a method that no longer fits
 * the basket's weight (the choice stands until checkout re-validates it; the view only prices
 * what still applies, it does not refuse). {@link cartShippingMethodSet} in `./items.ts` is what
 * refuses these same cases at the point of choosing.
 */
const shippingCostOf = (
    method: ReturnType<typeof findShippingMethod>,
    lines: CartLine[],
    currency: string
): number => {
    if (!method) return 0;
    const joined = lines.filter((line) => isJoined(line));
    if (!needsShipping(joined) || !methodFitsWeight(method, basketWeight(joined))) return 0;
    return priceShipping(method, sumLineItems(joined, currency).price);
};

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
        const shippingCost = shippingCostOf(
            cart?.shippingMethodId === undefined
                ? undefined
                : findShippingMethod(cart.shippingMethodId),
            lines,
            currency
        );
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
                totalPrice: price + shippingCost,
                currency
            },
            ...(cart?.shippingMethodId === undefined
                ? {}
                : { shippingMethodId: cart.shippingMethodId })
        };
    });
