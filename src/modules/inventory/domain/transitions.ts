/**
 * @module
 * Inventory rules. Pure: data in, verdict out — no status codes, no i18n, no database.
 * See: docs/theory/domain-layer.md
 *
 * A product carries two counters: `onHand` (units that exist) and `reserved` (units an open order
 * has claimed). What a customer may buy is the difference, and `availabilityOf` is the only
 * definition of it in the codebase.
 *
 * Six transitions move those counters, and this file is the one place that says what each does.
 * A seventh is one entry here plus one enum value in `openapi.yaml`.
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
 * The six transitions, as a total map from reason to what it does.
 *
 * Reading it as a table is the point: only `receive`, `adjust` and `commit` change how many units
 * exist; `commit` moves both columns together so a sale does not change availability; `release`
 * and `expire` are the same arithmetic under two names, kept separate because the ledger's job is
 * to say which story it was.
 *
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

        // The sale completes: the units leave the building and stop being spoken for.
        case StockMovementReason.commit: {
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

/**
 * Availability, in the one place it is defined.
 *
 * Trivial and exported anyway: three transcriptions of `a - b` is how one of them ends up
 * subtracting the wrong pair. Clamped at zero — `reserved > onHand` should be unreachable, but a
 * negative count must never reach a screen.
 *
 * @param counters - a product's two counters; either may be absent
 * @returns units a customer may buy, never below zero
 */
export const availabilityOf = (counters: { onHand?: number; reserved?: number }): number =>
    Math.max(0, (counters.onHand ?? 0) - (counters.reserved ?? 0));
