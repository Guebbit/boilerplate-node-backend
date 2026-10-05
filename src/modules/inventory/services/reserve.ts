/**
 * @module
 * Taking a hold for an order: all lines or none, with the unwinding a refusal needs.
 */

import { logger } from '@infrastructure/adapters/logger';
import { productService } from '@modules/products';
import { StockMovementReason } from '@types';
import { reservationTtlMinutes } from '../config';
import { stockLevelRepository, reservationRepository } from '../repository';
import type { ReservationDocument } from '../model';
import type { StockLine, StockShortfall, ReserveOutcome } from './types';
import { applyTransition } from './transition';

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
                note
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
        return { held: true, expiresAt: existing?.expiresAt ?? expiresAt };
    }

    const taken: StockLine[] = [];
    // eslint-disable-next-line no-restricted-syntax -- multi-step write with partial rollback: a thrown error partway through must give back only the lines actually taken, then rethrow, so no safe wrapper covers this
    try {
        for (const line of inLockOrder(lines)) {
            const held = await applyTransition(
                StockMovementReason.reserve,
                line.productId,
                line.quantity,
                { reference: orderId }
            );
            if (!held) {
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
                    available: blockerLevel?.available ?? 0
                };

                await giveBackAndDeleteHold(
                    orderId,
                    taken,
                    hold,
                    'rolled back — another line could not be held'
                );
                return { held: false, shortfalls: [shortfall] };
            }
            taken.push(line);
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

    return { held: true, expiresAt };
};
