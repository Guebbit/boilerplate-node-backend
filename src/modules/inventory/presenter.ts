/**
 * @module
 * The one place stock counters become the wire shapes `openapi.yaml` declares. The counters are
 * this module's; the title and the release date are `products`' to give, so the services read
 * both and hand them over as facts — nothing here reaches into another module.
 */

import type { Types } from 'mongoose';
import type { InventoryLevel, PreorderLevel } from '@types';
import type { PreorderLevelRow, StockLevelRow } from './repository';

/** What `products` tells the preorder board about one row. */
export interface PreorderProductFacts {
    /** Absent when the product cannot be found: the row then falls back to its id. */
    title?: string;
    releaseDate?: Date;
    /** The product is a preorder now, or open to backorder: only then does its cap promise anything. */
    sellsAgainstCap: boolean;
}

/**
 * One product's counters with its title.
 *
 * @param level - the counters; `productId` may still be an ObjectId when read off a document
 * @param title - the product's title
 */
export const presentInventoryLevel = (
    level: Omit<StockLevelRow, 'productId'> & { productId: string | Types.ObjectId },
    title: string
): InventoryLevel => ({
    productId: String(level.productId),
    title,
    onHand: level.onHand,
    reserved: level.reserved,
    available: level.available,
    backorderLimit: level.backorderLimit,
    backordered: level.backordered
});

/**
 * One row of the preorder board. `left` is the room under the cap and exists only while the cap
 * promises something; `null` is the contract's way to say there is no cap, so no number is left.
 *
 * @param row - the counters
 * @param facts - what `products` says about this product
 */
export const presentPreorderLevel = (
    row: PreorderLevelRow,
    { title, releaseDate, sellsAgainstCap }: PreorderProductFacts
): PreorderLevel => ({
    ...row,
    title: title ?? row.productId,
    ...(releaseDate ? { releaseDate: releaseDate.toISOString() } : {}),
    ...(sellsAgainstCap
        ? {
              left:
                  row.backorderLimit === null
                      ? null
                      : Math.max(0, row.backorderLimit - row.backordered)
          }
        : {})
});
