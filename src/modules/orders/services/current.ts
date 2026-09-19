/**
 * @module
 * Resolves each order line's LIVE picture from the catalogue, at the serialization boundary —
 * never the frozen snapshot, which stopped carrying one (`orderLineProductSchema` no longer
 * declares `imageUrl`/`thumbnailUrl`; see `../model`). One batched `$in` query per response,
 * however many orders or lines it holds, so a page of results costs one extra query rather than
 * one per line. `null` means the catalogue product (`product.id`) has been hard-deleted — the
 * frontend's placeholder, not a backend guess.
 */

import { productService } from '@modules/products';

/** The live picture for one order line, or `null` when its product is gone. */
export type OrderLineCurrent = { imageUrl: string; thumbnailUrl?: string } | null;

/** The one thing this needs from a serialized order line: the catalogue id it was bought from. */
interface OrderLineShape {
    product?: { id?: unknown };
    current?: OrderLineCurrent;
}

/** A serialized order shell, loose enough to cover both the list and single-order response shapes. */
interface OrderShape {
    items?: unknown;
}

/** Narrows a serialized order's `items` to the lines this module can read a product id from. */
const linesOf = (order: OrderShape): OrderLineShape[] =>
    Array.isArray(order.items) ? (order.items as OrderLineShape[]) : [];

/** Distinct catalogue ids referenced across every order in the response — what the `$in` resolves. */
const distinctProductIds = (orders: OrderShape[]): string[] => {
    const ids = new Set<string>();
    for (const order of orders)
        for (const line of linesOf(order))
            if (typeof line.product?.id === 'string') ids.add(line.product.id);
    return [...ids];
};

/**
 * Attaches `current` to every line of every order passed in — mutates and returns the same
 * array, since by this point the caller already owns the plain, serialized shape.
 *
 * @param orders - one or many serialized orders, admin-hydrated or owner-scoped alike; both
 *   shapes agree past `applyOrderTransform`, which is all this reads
 */
export const resolveCurrentImages = <T extends OrderShape>(orders: T[]): Promise<T[]> => {
    const ids = distinctProductIds(orders);
    if (ids.length === 0) return Promise.resolve(orders);

    // One `find({_id: {$in}})` for the whole response — `findManyByIds` returns lean,
    // untransformed rows, which is all a lookup keyed by `_id` needs.
    return productService.findManyByIds(ids).then((products) => {
        const byId = new Map(products.map((product) => [String(product._id), product]));

        for (const order of orders)
            for (const line of linesOf(order)) {
                const product =
                    typeof line.product?.id === 'string' ? byId.get(line.product.id) : undefined;
                line.current = product
                    ? {
                          // Always present at runtime — `imageUrl` carries a schema default
                          // (`productSchema`) that never leaves a stored product without one.
                          // The type is optional only because the wire contract lets a caller
                          // omit it on WRITE, not because a read can find it absent.
                          imageUrl: product.imageUrl!,
                          ...(product.thumbnailUrl ? { thumbnailUrl: product.thumbnailUrl } : {})
                      }
                    : null;
            }

        return orders;
    });
};
