/**
 * @module
 * The test-side door into `inventory`'s storage, for a sibling module's own tests.
 * A sibling reads and forces stock rows here instead of reaching `../repository` or `../model`,
 * which its import boundary refuses.
 *
 * @see docs/reference/tests.md#the-suites
 */

import type { Types } from 'mongoose';
import { stockLevelModel } from '../model';

/**
 * Erase a product's level row, for a sibling's test of a product with none. Not on
 * `inventoryService`: only this module's own `product.deleted` listener runs it in production.
 */
export { removeLevel } from '../services/levels';

/** The stock rows and holds themselves — a sibling's own assertion on what the ledger holds. */
export { stockLevelRepository, reservationRepository } from '../repository';

/**
 * Overwrite a level row's counters, bypassing every stock rule — the one way a test moves stock
 * behind a cart's back.
 * Never a production door: every real stock write goes through a conditional movement.
 */
export const forceStockLevel = (productId: Types.ObjectId, onHand: number, reserved: number) =>
    stockLevelModel.updateOne(
        { productId },
        { $set: { onHand, reserved, available: onHand - reserved } }
    );
