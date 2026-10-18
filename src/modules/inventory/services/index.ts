/**
 * @module
 * Inventory — the only place stock changes. A counter never moves without a ledger row, and
 * never the reverse; both halves happen inside `applyTransition`, which every function here goes
 * through. One file per flow, not one big file; see `docs/theory/layers.md`.
 *
 * Transactions: only where a half-done write would be wrong — a hold's claim and commit
 *               (`holds.ts`), a delivery with its preorder allocation (`admin.ts`), a hold's
 *               release with its announcement (`sweep.ts`). The rest are conditional
 *               single-document writes; gaps are noted at the call sites that own them. See: docs/modules/inventory.md
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
import { receive, adjust, setBackorderLimit } from './admin';

export type {
    StockLine,
    StockShortfall,
    ReserveOutcome,
    LevelFilters,
    MovementFilters
} from './types';

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
    setBackorderLimit,
    listLevels,
    listPreorders,
    lowStockCount,
    listMovements
};
