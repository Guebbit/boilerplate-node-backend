/**
 * @module
 * Undoing an order that cannot stand — `@modules/cart`'s checkout is the one caller, retracting the
 * order and its hold together when a race it lost (`CART_CHANGED`) leaves a written order this
 * request must not keep. `place.ts` holds stock BEFORE writing the order (B20), so a refused
 * reserve there writes nothing to retract in the first place, and a write that fails after the hold
 * succeeded only has a hold to give back — never a row to delete.
 */

import { logger } from '@infrastructure/adapters/logger';
import { inventoryService } from '@modules/inventory';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';

/**
 * Undo an order the request that wrote it cannot keep — the compensation both `place.ts` and
 * `@modules/cart`'s checkout run when a later step refuses.
 *
 * Never rejects: the refusal it precedes is already the right answer, and a failed cleanup must
 * not report it as a 500. Each step is guarded alone so neither aborts the other; the release
 * goes first, so it still names a live order. A refused reserve deletes the hold row outright,
 * so no sweep can find what is left behind — these logs are the only signal a human gets.
 *
 * @param order - the order being retracted
 * @param releaseHold - whether units are still held against it
 */
export const retractOrder = (order: OrderDocument, releaseHold: boolean): Promise<void> => {
    const orderId = String(order._id);

    // The raw `error`, not a flattened message — `redactFormat` (`adapters/logger.ts`) serializes
    // an `Error` into `{name, message, stack}` before JSON output.
    const report = (message: string) => (error: unknown) => {
        // Stryker disable all
        logger.error({
            message,
            orderId,
            error
        });
        // Stryker restore all
    };

    return (
        releaseHold
            ? inventoryService.releaseForOrder(orderId).catch(report('Rollback: hold not released'))
            : Promise.resolve()
    )
        .then(() => orderRepository.deleteOne(order))
        .catch(report('Rollback: order not deleted'));
};
