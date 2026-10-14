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
    shipForOrder,
    shipLinesForOrder,
    releaseLinesForOrder,
    releaseForOrder,
    releaseCommittedForOrder,
    refreshStockCacheForOrder,
    extendHoldForOrder,
    isStockBoundToOrder,
    isHoldReleased
} from './holds';
import { restockReturnedLines } from './returns';
import { refreshStockCacheForProducts } from './transition';
import { runReservationSweep } from './sweep';
import {
    availableFor,
    openLevel,
    removeLevel,
    listLevels,
    lowStockCount,
    listMovements,
    listPreorders
} from './levels';
import { receive, adjust, setPreorderLimit } from './admin';

/*
 * Every operation is published by name as well as through the object below: `module.ts` and
 * `metrics.ts` call `openLevel`, `removeLevel`, `receive` and `lowStockCount` directly, and the
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
    shipForOrder,
    shipLinesForOrder,
    releaseLinesForOrder,
    releaseForOrder,
    releaseCommittedForOrder,
    refreshStockCacheForOrder,
    extendHoldForOrder
} from './holds';
export { restockReturnedLines } from './returns';
export { refreshStockCacheForProducts } from './transition';
export { runReservationSweep } from './sweep';
export {
    availableFor,
    openLevel,
    removeLevel,
    listLevels,
    lowStockCount,
    listMovements,
    listPreorders
} from './levels';
export { receive, adjust, setPreorderLimit } from './admin';

/** The module's one service handle. */
export const inventoryService = {
    reserveForOrder,
    commitForOrder,
    shipForOrder,
    shipLinesForOrder,
    releaseLinesForOrder,
    releaseForOrder,
    releaseCommittedForOrder,
    refreshStockCacheForOrder,
    restockReturnedLines,
    refreshStockCacheForProducts,
    extendHoldForOrder,
    isStockBoundToOrder,
    isHoldReleased,
    runReservationSweep,
    availableFor,
    openLevel,
    removeLevel,
    receive,
    adjust,
    setPreorderLimit,
    listLevels,
    listPreorders,
    lowStockCount,
    listMovements
};
