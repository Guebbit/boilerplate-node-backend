/**
 * @module
 * Inventory — the only place stock changes. A counter never moves without a ledger row, and
 * never the reverse; both halves happen inside `applyTransition`, which every function here goes
 * through. A folder rather than one file because it passed ~800 lines; see `docs/theory/layers.md`.
 *
 * No Mongo transactions, matching the rest of the repo — gaps are noted at the call sites that
 * own them. See: docs/modules/inventory.md
 */

import { reserveForOrder } from './reserve';
import {
    commitForOrder,
    releaseForOrder,
    restockForOrder,
    refreshStockCacheForOrder,
    extendHoldForOrder,
    isStockBoundToOrder
} from './holds';
import { restockReturnedLines, refreshStockCacheForProducts } from './returns';
import { runReservationSweep } from './sweep';
import { ensureLevel, removeLevel, listLevels, lowStockCount, listMovements } from './levels';
import { receive, adjust } from './admin';

/*
 * Every operation is published by name as well as through the object below: `module.ts` and
 * `metrics.ts` call `ensureLevel`, `removeLevel`, `receive` and `lowStockCount` directly, and the
 * suites drive the rest. The barrel's surface must not shrink when a file moves.
 */
export type {
    StockLine,
    StockShortfall,
    ReserveOutcome,
    LevelFilters,
    MovementFilters
} from './types';
export { reserveForOrder } from './reserve';
export {
    commitForOrder,
    releaseForOrder,
    restockForOrder,
    refreshStockCacheForOrder,
    extendHoldForOrder
} from './holds';
export { restockReturnedLines, refreshStockCacheForProducts } from './returns';
export { runReservationSweep } from './sweep';
export { ensureLevel, removeLevel, listLevels, lowStockCount, listMovements } from './levels';
export { receive, adjust } from './admin';

/** The module's one service handle. */
export const inventoryService = {
    reserveForOrder,
    commitForOrder,
    releaseForOrder,
    restockForOrder,
    refreshStockCacheForOrder,
    restockReturnedLines,
    refreshStockCacheForProducts,
    extendHoldForOrder,
    isStockBoundToOrder,
    runReservationSweep,
    ensureLevel,
    removeLevel,
    receive,
    adjust,
    listLevels,
    lowStockCount,
    listMovements
};
