/**
 * @module
 * Taking a hold for an order: all lines or none, with the unwinding a refusal needs.
 */

import { logger } from '@infrastructure/adapters/logger';
import { withTransaction } from '@infrastructure/runtime/database';
import { productService } from '@modules/products';
import { StockMovementReason } from '@types';
import { reservationTtlMinutes } from '../config';
import { roomOn } from '../domain';
import { stockLevelRepository, reservationRepository } from '../repository';
import type { ReservationDocument, StockLevelDocument } from '../model';
import type { StockLine, StockShortfall, ReserveOutcome } from './types';
import { applyTransition, refreshStockCache } from './transition';

/**
 * Give back every line already taken for a reserve that will not complete, and delete the hold
 * that named them — shared by a refused line and a line whose write threw.
 *
 * The hold is narrowed to `taken` FIRST, before a single counter moves: a crash partway through
 * this cleanup then leaves a hold that still names only real reservations, never a line whose
 * counters were never touched — the exact leak this fixes (`docs/modules/inventory-reservations.md`).
 * Each release is logged rather than allowed to throw, so one failed give-back doesn't stop the
 * others or hide which line it was.
 *
 * @param orderId - the order whose reserve is being unwound
 * @param taken - the lines actually taken before the refusal or throw
 * @param hold - the hold document to delete once its lines are given back
 * @param note - why the ledger shows this release
 */
const giveBackAndDeleteHold = async (
    orderId: string,
    taken: readonly StockLine[],
    hold: ReservationDocument,
    note: string
): Promise<void> => {
    await reservationRepository.narrowToTaken(orderId, taken);
    await Promise.all(
        taken.map((line) =>
            applyTransition(StockMovementReason.release, line.productId, line.quantity, {
                reference: orderId,
                note,
                ...(line.kind ? { kind: line.kind } : {})
            }).catch((error: unknown) => {
                // Stryker disable all
                logger.error({
                    message: `Inventory: could not release ${line.quantity} of product ${line.productId} while rolling back a failed reserve for order ${orderId}`,
                    error
                });
                // Stryker restore all
            })
        )
    );
    await reservationRepository.deleteOne(hold).catch((error: unknown) => {
        // Stryker disable all
        logger.error({
            message: `Inventory: could not delete the hold for order ${orderId} after rolling back its reserve`,
            error
        });
        // Stryker restore all
    });
};

/**
 * The lines in the order they are taken: by product id, whatever order the caller listed them in.
 *
 * One consistent lock order is what keeps two multi-line checkouts from refusing each other: two
 * orders listing the same products oppositely would each take their first line, find the other's
 * unit gone on the second, and both give up. Sorted, they meet on the same product first and one
 * goes on. https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS
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

/**
 * Take a line that may spill, as ONE transaction: the whole line from the shelf when it fits;
 * otherwise the shelf part and a claim on the cap for the rest, and the hold rewritten to say
 * which is which. A crash anywhere inside leaves nothing taken, and a claim the cap refuses gives
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
        if (fits) return [line];

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

        const hold = await reservationRepository.findOpenByOrderId(orderId, session);
        const others = (hold?.items ?? [])
            .filter((item) => String(item.productId) !== line.productId)
            .map(({ productId, quantity, kind }) => ({
                productId: String(productId),
                quantity,
                kind
            }));
        await reservationRepository.replaceItems(
            orderId,
            [...others, ...shelfPart, owed],
            undefined,
            session
        );
        return [...shelfPart, owed];
    }).catch((error: unknown) => {
        // The shelf part rolled back with the transaction; nothing of this line is taken.
        if (error instanceof OwedRefused) return null;
        throw error;
    });

    // Written outside the transaction by design: the catalogue's copy cannot roll back.
    if (parts) await refreshStockCache(line.productId);
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

    const held = await applyTransition(takeReasonFor(line), line.productId, line.quantity, {
        reference: orderId
    });
    return held ? [line] : null;
};

/**
 * Hold every line for an order, or hold none of it.
 *
 * Exactly-once: the hold is written first, and its unique `orderId` means a retried checkout
 * loses the insert without touching a counter. Lines are then taken one conditional write each,
 * so two checkouts racing the last unit resolve inside mongod. A failed line rolls back through
 * `applyTransition` — same as every other change — so the ledger shows the take and give-back
 * rather than netting them to silence.
 *
 * A line that THROWS (a database hiccup, not a refusal) is exception-safe too: the `try` unwinds
 * through {@link giveBackAndDeleteHold} exactly like a refusal, then rethrows — so a hold never
 * survives naming lines this call never actually took.
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
    const expiresAt = new Date(Date.now() + holdMinutes * 60_000);
    const hold = await reservationRepository.insertHold(orderId, lines, expiresAt);
    // Already held — a retry, or a double-clicked button. The first call did the work; report
    // ITS expiry, not the fresh guess this attempt computed but never actually wrote.
    if (!hold) {
        const existing = await reservationRepository.findByOrderId(orderId);
        return { held: true, expiresAt: existing?.expiresAt ?? expiresAt, owed: [] };
    }

    const taken: StockLine[] = [];
    const owed: { productId: string; quantity: number }[] = [];
    // eslint-disable-next-line no-restricted-syntax -- multi-step write with partial rollback: a thrown error partway through must give back only the lines actually taken, then rethrow, so no safe wrapper covers this
    try {
        for (const line of inLockOrder(lines)) {
            const parts = await takeLine(orderId, line);
            if (!parts) {
                /*
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

                await giveBackAndDeleteHold(
                    orderId,
                    taken,
                    hold,
                    'rolled back — another line could not be held'
                );
                return { held: false, shortfalls: [shortfall] };
            }
            taken.push(...parts);
            owed.push(...owedPartsOf(line, parts));
        }
    } catch (error) {
        await giveBackAndDeleteHold(
            orderId,
            taken,
            hold,
            'rolled back — reserve failed partway through'
        );
        throw error;
    }

    return { held: true, expiresAt, owed };
};
