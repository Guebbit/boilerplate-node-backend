/**
 * @module
 * Inventory rules. Pure: data in, verdict out — no status codes, no i18n, no database. A product
 * carries two counters, `onHand` (units that exist) and `reserved` (units an open order has
 * claimed). Eight transitions move those counters, and this file is the one place that says what
 * each does — a ninth is one entry here plus one enum value in `openapi.yaml`. What a customer
 * may actually buy from those two counters is `@modules/products`'s `availableStock`
 * (`src/modules/products/domain/stock.ts`), not this module's own concern.
 *
 * See: docs/theory/domain-layer.md
 */

import { StockMovementReason } from '@types';

/**
 * What one transition does to the two counters. Both signed, either possibly zero.
 *
 * Recording the pair on every ledger row is what makes the ledger replayable;
 * `src/modules/inventory/tests/integration/ledger.property.test.ts` asserts that over arbitrary
 * transition sequences.
 */
export interface CounterDelta {
    onHandDelta: number;
    reservedDelta: number;
}

/**
 * The eight transitions, as a total map from reason to what it does. `receive`, `adjust`, `ship`
 * and `restock` change how many units are on the shelf; `ship` moves both columns together so a
 * dispatch doesn't change availability; `commit` moves neither (payment settles the claim, the
 * units stay on the shelf until dispatch); `release` and `expire` are the same arithmetic under
 * two names, kept separate because the ledger records which story it was.
 * @param reason - which transition
 * @param quantity - how many units; signed only for `adjust`, positive for everything else
 * @returns the pair of counter deltas the transition implies
 */
export const counterDeltaFor = (reason: StockMovementReason, quantity: number): CounterDelta => {
    switch (reason) {
        // A hold. The units stay where they are and stop being sellable.
        case StockMovementReason.reserve: {
            return { onHandDelta: 0, reservedDelta: quantity };
        }

        // The order was paid: the claim is settled, the units stay on the shelf and stay spoken for.
        case StockMovementReason.commit: {
            return { onHandDelta: 0, reservedDelta: 0 };
        }

        // The parcel leaves: the units are off the shelf and no longer spoken for.
        case StockMovementReason.ship: {
            return { onHandDelta: -quantity, reservedDelta: -quantity };
        }

        // The hold is given up — cancelled, or timed out. The units become sellable again.
        case StockMovementReason.release:
        case StockMovementReason.expire: {
            return { onHandDelta: 0, reservedDelta: -quantity };
        }

        // A delivery. The only transition that can create units.
        case StockMovementReason.receive: {
            return { onHandDelta: quantity, reservedDelta: 0 };
        }

        // Returned goods are received back on the shelf. `reserved` is untouched: `ship` already
        // took it down, and nothing reserved these units again in the meantime.
        case StockMovementReason.restock: {
            return { onHandDelta: quantity, reservedDelta: 0 };
        }

        /*
         * The one case where `quantity` is already signed — `-3` is three units of shrinkage. No
         * `Math.abs`: taking the sign from the number is what lets one transition serve both
         * directions instead of a second `write-off` reason saying the same thing.
         */
        case StockMovementReason.adjust: {
            return { onHandDelta: quantity, reservedDelta: 0 };
        }
    }
};
