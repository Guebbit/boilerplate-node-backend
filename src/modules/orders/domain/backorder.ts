/**
 * @module
 * What an order freezes about the units it owes: how many, and the day they were promised. Pure.
 *
 * See: docs/modules/orders.md
 */

import { DAY_MS } from '@domain-primitives/time';

/** Days a buyer is promised when the product names no restock date (CRD Art. 18(1), FTC 435.2). */
export const DEFAULT_BACKORDER_PROMISE_DAYS = 30;

/** The owed part of one order line, frozen. */
export interface OwedLine {
    backorderedQuantity: number;
    promisedAt: Date;
    /**
     * Whether `promisedAt` is a date the product named (its restock date) rather than the 30-day
     * default. The buyer is told "by <date>" or "within 30 days", and a later change to the
     * catalogue's date moves only a promise that was one.
     */
    promiseDated: boolean;
}

/**
 * Freeze the owed part of a line, or nothing when the shelf covered it all.
 *
 * @param owed - how many units of the line the shelf could not cover
 * @param restockDate - the product's restock date, when it names one
 * @param placedAt - the instant the order is placed
 * @returns the owed quantity and its promise (the restock date, else `placedAt` plus 30 days) and
 *   whether that date was the product's, or `undefined` when nothing is owed
 */
export const owedLineOf = (
    owed: number,
    restockDate: Date | undefined,
    placedAt: Date
): OwedLine | undefined =>
    owed > 0
        ? {
              backorderedQuantity: owed,
              promisedAt:
                  restockDate ??
                  new Date(placedAt.getTime() + DEFAULT_BACKORDER_PROMISE_DAYS * DAY_MS),
              promiseDated: restockDate !== undefined
          }
        : undefined;
