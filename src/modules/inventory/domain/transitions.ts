/**
 * @module
 * Inventory rules. Pure: data in, verdict out — no status codes, no i18n, no database. A product
 * carries two counters, `onHand` (units that exist) and `reserved` (units an open order has
 * claimed), and a third, `backordered`, for units that do not exist yet and are only promised.
 * Nine transitions move those counters, and this file is the one place that says what each does — an
 * tenth is one entry here plus one enum value in `openapi.yaml`. What a customer
 * may actually buy from those two counters is `@modules/products`'s `availableStock`
 * (`src/modules/products/domain/stock.ts`), not this module's own concern.
 *
 * See: docs/theory/domain-layer.md
 */

import { StockMovementReason } from '@types';

/**
 * What a hold's units are: `stock` units exist and sit on the shelf; `preorder` units do not exist
 * yet and are only a claim on the product's preorder allowance (`backorderLimit`).
 */
export type HoldKind = 'stock' | 'backorder';

/**
 * What one transition does to the counters. All signed, any possibly zero.
 *
 * Recording every column on every ledger row is what makes the ledger replayable;
 * `src/modules/inventory/tests/integration/ledger.property.test.ts` asserts that over arbitrary
 * transition sequences.
 */
export interface CounterDelta {
    onHandDelta: number;
    reservedDelta: number;
    /** Units claimed against the preorder allowance and not yet allocated. */
    backorderedDelta: number;
}

/**
 * The nine transitions, as a total map from reason to what it does. `receive`, `adjust`, `ship`
 * and `restock` change how many units are on the shelf; `ship` moves both columns together so a
 * dispatch doesn't change availability; `release` and `expire` are the same arithmetic under
 * two names, kept separate because the ledger records which story it was.
 * @param reason - which transition
 * @param quantity - how many units; signed only for `adjust`, positive for everything else
 * @param kind - what the units are; only `release`/`expire` read it, since a preorder claim
 *   gives back the allowance rather than `reserved`
 * @returns the counter deltas the transition implies
 */
export const counterDeltaFor = (
    reason: StockMovementReason,
    quantity: number,
    kind: HoldKind = 'stock'
): CounterDelta => {
    switch (reason) {
        // A hold. The units stay where they are and stop being sellable.
        case StockMovementReason.reserve: {
            return { onHandDelta: 0, reservedDelta: quantity, backorderedDelta: 0 };
        }

        // The parcel leaves: the units are off the shelf and no longer spoken for.
        case StockMovementReason.ship: {
            return { onHandDelta: -quantity, reservedDelta: -quantity, backorderedDelta: 0 };
        }

        // The hold is given up — cancelled, or timed out. The units become sellable again.
        case StockMovementReason.release:
        case StockMovementReason.expire: {
            // A preorder claim never touched `reserved`, so giving it up gives back the allowance.
            return kind === 'backorder'
                ? { onHandDelta: 0, reservedDelta: 0, backorderedDelta: -quantity }
                : { onHandDelta: 0, reservedDelta: -quantity, backorderedDelta: 0 };
        }

        // A preorder: the units do not exist yet, so only the allowance moves.
        case StockMovementReason.backorder: {
            return { onHandDelta: 0, reservedDelta: 0, backorderedDelta: quantity };
        }

        // Stock arrived for a paid preorder: the claim becomes a real hold on a real unit.
        case StockMovementReason.allocate: {
            return { onHandDelta: 0, reservedDelta: quantity, backorderedDelta: -quantity };
        }

        // A delivery. The only transition that can create units.
        case StockMovementReason.receive: {
            return { onHandDelta: quantity, reservedDelta: 0, backorderedDelta: 0 };
        }

        // Returned goods are received back on the shelf. `reserved` is untouched: `ship` already
        // took it down, and nothing reserved these units again in the meantime.
        case StockMovementReason.restock: {
            return { onHandDelta: quantity, reservedDelta: 0, backorderedDelta: 0 };
        }

        /*
         * The one case where `quantity` is already signed — `-3` is three units of shrinkage. No
         * `Math.abs`: taking the sign from the number is what lets one transition serve both
         * directions instead of a second `write-off` reason saying the same thing.
         */
        case StockMovementReason.adjust: {
            return { onHandDelta: quantity, reservedDelta: 0, backorderedDelta: 0 };
        }
    }
};
