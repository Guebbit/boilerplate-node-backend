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

import { sumLineItems } from '@modules/orders';
import type { ProductDocument } from '@modules/products';
import type { CartItem } from '@types';
import type { CartDocument } from '../model';

/**
 * A cart line joined with the product it references.
 * `productId` and `product` are separate fields on purpose: `populate()` overwrites the
 * reference in place with `null` when the product is gone, so the id must be captured first
 * (see {@link readCartLines}).
 */
export interface CartLine extends CartItem {
    /** The joined product, or `null` for a reference that resolves to nothing. */
    product: ProductDocument | null;
}

/** A cart line whose reference resolved — what an order may be built from. */
export type JoinedCartLine = CartLine & { product: ProductDocument };

/**
 * The cart as `openapi.yaml` declares it: `CartResponse`, built rather than serialized.
 *
 * Every cart endpoint answers with this — the reads directly, the mutations as their payload —
 * which is why no controller has to re-read the cart after changing it.
 */
export interface CartView {
    items: CartItem[];
    summary: { itemsCount: number; totalQuantity: number; total: number };
}

/**
 * A cart after `populate('items.productId')`.
 *
 * Names what Mongoose swaps into the reference field, so the populated read is typed rather than
 * cast. Spelled as the whole `items` key because `populate<T>` merges `T` over the document's
 * top-level properties — a dotted path is not a key it can merge on.
 */
interface PopulatedCart {
    items: { productId: ProductDocument | null; quantity: number }[];
}

/** Narrow a line to one whose product actually exists. */
export const isJoined = (line: CartLine): line is JoinedCartLine => line.product !== null;

/**
 * Join a cart's lines to their products, in one query.
 *
 * The ids are read before `populate()` runs, because populate replaces the reference field with
 * the fetched document — or with `null` for a product that has since been deleted.
 */
export const readCartLines = (cart: CartDocument | null): Promise<CartLine[]> => {
    if (!cart) return Promise.resolve([]);

    const productIds = cart.items.map(({ productId }) => productId.toString());

    // No `items = []` fallback: the schema defaults the array, so a hydrated cart always has one.
    return cart.populate<PopulatedCart>('items.productId').then(({ items }) =>
        items.map(({ productId, quantity }, index) => ({
            productId: productIds[index],
            quantity,
            product: productId
        }))
    );
};

/**
 * Turn a cart document into the response the contract declares.
 * The joined `product` prices the cart, then is dropped: `CartItem` in `openapi.yaml` is
 * `additionalProperties: false` over `{ productId, quantity }`. Use `cartGet` where the joined
 * product is actually needed.
 */
export const toCartView = (cart: CartDocument | null): Promise<CartView> =>
    readCartLines(cart).then((lines) => {
        const { count, quantity, price } = sumLineItems(lines);
        return {
            items: lines.map(({ productId, quantity: lineQuantity }) => ({
                productId,
                quantity: lineQuantity
            })),
            summary: {
                itemsCount: count,
                totalQuantity: quantity,
                total: price
            }
        };
    });
