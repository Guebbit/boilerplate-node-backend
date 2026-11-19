/**
 * @module
 * Taking a hold for an order: all lines or none, with the unwinding a refusal needs.
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { withTransaction } from '@infrastructure/runtime/database';
import { productService } from '@modules/products';
import { StockMovementReason } from '@types';
import { reservationTtlMinutes } from '../config';
import { roomOn } from '../domain';
import { stockLevelRepository, reservationRepository } from '../repository';
import type { StockLevelDocument } from '../model';
import type { StockLine, StockShortfall, ReserveOutcome } from './types';
import { applyTransition, refreshStockCacheForProducts } from './transition';
import { releaseForOrder } from './holds';
import { MINUTE_MS } from '@domain-primitives/time';

/**
 * Give back everything an unfinished reserve took — shared by a refused line and a line whose
 * write threw.
 *
 * The hold lists only lines whose counters moved in the same transaction, so the claim-guarded
 * release gives back exactly those. A hold the sweep already claimed releases nothing here (no
 * double give-back). The hold is never deleted: it ends `released`, a counter-backed record of
 * what was held, and a release that threw leaves it `held` for the sweep to free later.
 * A failure is logged rather than thrown, so the caller still reports the original refusal.
 *
 * A release that succeeds refreshes the catalogue's stock cache itself. One that fails does not,
 * so the lines already taken are refreshed here, in that branch only: their counters moved and
 * nothing else will say so before the sweep.
 *
 * @param orderId - the order whose reserve is being unwound
 * @param takenProductIds - the products whose counters this reserve already moved
 */
const giveBack = (orderId: string, takenProductIds: readonly string[]): Promise<void> =>
    releaseForOrder(orderId)
        .then(() => undefined)
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Inventory: could not roll back the reserve for order ${orderId}; the sweep frees what is left`,
                error
            });
            // Stryker restore all
            return refreshStockCacheForProducts(takenProductIds);
        });

/**
 * The lines in the order they are taken: by product id, whatever order the caller listed them in.
 *
 * One consistent lock order is what keeps two multi-line checkouts from refusing each other: two
 * orders listing the same products oppositely would each take their first line, find the other's
 * unit gone on the second, and both give up. Sorted, they meet on the same product first and one
 * goes on.
 *
 * @param lines - the lines as the caller listed them
 * @returns a copy sorted by product id
 */
const inLockOrder = (lines: readonly StockLine[]): StockLine[] =>
    // Hex ids: any fixed locale orders them the same way on every worker.
    lines.toSorted((a, b) => a.productId.localeCompare(b.productId, 'en'));

/**
 * What a line takes: a shelf unit (`reserve`) or a claim on the preorder allowance (`preorder`).
 * @param line - the line being held
 */
const takeReasonFor = (line: StockLine): StockMovementReason =>
    line.kind === 'backorder' ? StockMovementReason.backorder : StockMovementReason.reserve;

/**
 * How many units of this line the product could still have given, read back after a refusal: shelf
 * units for a stock line, what is left of the allowance for a preorder line, both together for a
 * line that may spill.
 * @param line - the refused line
 * @param level - the product's level, or `null` when it has none
 */
const leftFor = (line: StockLine, level: StockLevelDocument | null): number => {
    if (line.kind === 'backorder') return roomOn(level);
    return line.spill ? (level?.available ?? 0) + roomOn(level) : (level?.available ?? 0);
};

/** Thrown inside a spilling line's transaction to abort it when the cap cannot take the owed part. */
class OwedRefused extends Error {}

/** Thrown inside a line's transaction when the hold is no longer `held`, so the take rolls back. */
class HoldClaimed extends Error {}

/**
 * Add the parts just taken to the hold, in the same transaction that took them: both land or
 * neither does, which is what keeps the sweep from releasing a unit this order never held.
 *
 * @param orderId - the order the hold belongs to
 * @param parts - the lines whose counters just moved in `session`
 * @param session - the transaction that moved them
 * @returns `parts`, for the caller to return
 * @throws {HoldClaimed} when the hold was claimed meanwhile, aborting the transaction
 */
const pushed = async (
    orderId: string,
    parts: StockLine[],
    session: ClientSession
): Promise<StockLine[]> => {
    if (!(await reservationRepository.pushItems(orderId, parts, session)))
        throw new HoldClaimed(`The hold for order ${orderId} was claimed while it was being taken`);
    return parts;
};

/**
 * Take a line that may spill, as ONE transaction: the whole line from the shelf when it fits;
 * otherwise the shelf part and a claim on the cap for the rest, and the hold gaining each part
 * it took. A crash anywhere inside leaves nothing taken, and a claim the cap refuses gives
 * the shelf part back by aborting.
 *
 * @param orderId - the order the hold belongs to
 * @param line - the line, asked for as shelf units
 * @returns the parts actually taken (the shelf part, then the owed part), or `null` when the
 *   shelf and the cap together cannot cover it
 */
const takeSpillLine = async (orderId: string, line: StockLine): Promise<StockLine[] | null> => {
    const parts = await withTransaction(async (session): Promise<StockLine[]> => {
        const fits = await applyTransition(
            StockMovementReason.reserve,
            line.productId,
            line.quantity,
            { reference: orderId },
            session
        );
        if (fits) return pushed(orderId, [line], session);

        // Read inside the transaction: the figure the take below is judged against.
        const level = await stockLevelRepository.findByProductId(line.productId, session);
        const shelf = Math.min(level?.available ?? 0, line.quantity);
        const shelfPart: StockLine[] =
            shelf > 0 ? [{ productId: line.productId, quantity: shelf }] : [];
        if (
            shelf > 0 &&
            !(await applyTransition(
                StockMovementReason.reserve,
                line.productId,
                shelf,
                { reference: orderId },
                session
            ))
        )
            throw new OwedRefused();
        const owed: StockLine = {
            productId: line.productId,
            quantity: line.quantity - shelf,
            kind: 'backorder'
        };
        const claimed = await applyTransition(
            StockMovementReason.backorder,
            owed.productId,
            owed.quantity,
            { reference: orderId },
            session
        );
        if (!claimed) throw new OwedRefused();

        return pushed(orderId, [...shelfPart, owed], session);
    }).catch((error: unknown) => {
        // The shelf part rolled back with the transaction; nothing of this line is taken.
        if (error instanceof OwedRefused) return null;
        throw error;
    });

    return parts;
};

/**
 * The owed units a line ended up with: the parts it was taken as that are claims, when it was
 * asked for as shelf units. A line asked for as a claim from the start is a preorder's, not owed.
 *
 * @param line - the line as it was asked for
 * @param parts - what it was taken as
 */
const owedPartsOf = (
    line: StockLine,
    parts: readonly StockLine[]
): { productId: string; quantity: number }[] =>
    line.kind === 'backorder'
        ? []
        : parts
              .filter(({ kind }) => kind === 'backorder')
              .map(({ productId, quantity }) => ({ productId, quantity }));

/**
 * Take one line of a hold.
 *
 * @param orderId - the order the hold belongs to
 * @param line - what to take
 * @returns the parts taken (one, or two for a spilling line), or `null` when the counters refused
 */
const takeLine = async (orderId: string, line: StockLine): Promise<StockLine[] | null> => {
    if (line.spill && line.kind !== 'backorder') return takeSpillLine(orderId, line);

    const taken = await withTransaction(async (session): Promise<StockLine[] | null> => {
        const held = await applyTransition(
            takeReasonFor(line),
            line.productId,
            line.quantity,
            { reference: orderId },
            session
        );
        return held ? pushed(orderId, [line], session) : null;
    });
    return taken;
};

/**
 * Hold every line for an order, or hold none of it.
 *
 * Exactly-once: an EMPTY hold is written first, and its unique `orderId` means a retried checkout
 * loses the insert without touching a counter. Each line is then taken in one transaction that
 * also adds it to the hold, so the hold never names a line whose counters did not move — even if
 * the process is killed between lines. A failed line unwinds through {@link giveBack},
 * so the ledger shows the take and the give-back rather than netting them to silence.
 *
 * A line that THROWS (a database hiccup, not a refusal) unwinds the same way, then rethrows.
 *
 * The catalogue's stock cache cannot roll back with a line's transaction, so it is refreshed once
 * for every line taken, after the last one. A refusal or a throw is refreshed by the release that
 * unwinds it.
 *
 * @param orderId - the order the hold belongs to
 * @param lines - what it claims
 * @param holdMinutes - how long the hold survives; `reservationTtlMinutes()` unless the caller
 *   is checking out a method with its own window (`bank_transfer`'s is longer, in hours)
 * @returns `held`, or the lines that fell short with what is actually available
 */
export const reserveForOrder = async (
    orderId: string,
    lines: readonly StockLine[],
    holdMinutes: number = reservationTtlMinutes()
): Promise<ReserveOutcome> => {
    const expiresAt = new Date(Date.now() + holdMinutes * MINUTE_MS);
    const hold = await reservationRepository.insertHold(orderId, [], expiresAt);
    /**
     * Already held — a retry, or a double-clicked button. The first call did the work; report
     * ITS expiry, not the fresh guess this attempt computed but never actually wrote.
     */
    if (!hold) {
        const existing = await reservationRepository.findByOrderId(orderId);
        return { held: true, expiresAt: existing?.expiresAt ?? expiresAt, owed: [] };
    }

    const owed: { productId: string; quantity: number }[] = [];
    const taken: string[] = [];
    // eslint-disable-next-line no-restricted-syntax -- multi-step write with partial rollback: a thrown error partway through must give back only the lines actually taken, then rethrow, so no safe wrapper covers this
    try {
        for (const line of inLockOrder(lines)) {
            const parts = await takeLine(orderId, line);
            if (!parts) {
                /**
                 * Read the blocker back before unwinding, so the reported number is the one that
                 * actually refused this line, not what a pre-flight saw earlier. Read from this
                 * module's own level, the source of truth — never the product's synced copy, which
                 * can lag by one transition. A deleted product or a level that never existed reads
                 * as nothing available, which is true either way.
                 */
                const [blockerLevel, blockerProduct] = await Promise.all([
                    stockLevelRepository.findByProductId(line.productId),
                    productService.findByIdRaw(line.productId)
                ]);
                const shortfall: StockShortfall = {
                    productId: line.productId,
                    title: blockerProduct?.title ?? '',
                    requested: line.quantity,
                    available: leftFor(line, blockerLevel)
                };

                await giveBack(orderId, taken);
                return { held: false, shortfalls: [shortfall] };
            }
            taken.push(line.productId);
            owed.push(...owedPartsOf(line, parts));
        }
    } catch (error) {
        await giveBack(orderId, taken);
        throw error;
    }

    await refreshStockCacheForProducts(taken);
    return { held: true, expiresAt, owed };
};
