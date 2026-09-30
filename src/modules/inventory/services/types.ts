/**
 * @module
 * The shapes the stock operations take and answer with.
 */

import type { StockMovementReason } from '@types';
import type { PaginationInput } from '@infrastructure/persistence/search';

/** A line being held or given back. Ids as strings — the repository converts. */
export interface StockLine {
    productId: string;
    quantity: number;
}

/** One line a hold could not cover, and by how much it fell short. */
export interface StockShortfall {
    productId: string;
    title: string;
    requested: number;
    available: number;
}

/**
 * What a reserve answers — a result rather than a boolean, so a refusal can name which line and
 * how many are left, read back at the moment it refused rather than a stale pre-flight figure.
 * A hold's `expiresAt` is the SAME value the reservation itself was written with — the one real
 * deadline, never a second figure a caller computes on its own from the same `holdMinutes`.
 */
export type ReserveOutcome =
    | { held: true; expiresAt: Date }
    | { held: false; shortfalls: StockShortfall[] };

/** What a stock-board read accepts. */
export interface LevelFilters extends PaginationInput {
    lowOnly?: boolean;
}

/** What a ledger read accepts, on top of the shared `page`/`pageSize`. */
export interface MovementFilters {
    productId?: string;
    reason?: StockMovementReason;
}
