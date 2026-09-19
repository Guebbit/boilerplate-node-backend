/**
 * @module
 * Undoing an order that cannot stand — split out on its own so both `crud.ts` and `place.ts` can
 * call it without importing each other: `place.ts` uses it to roll back a write whose stock hold
 * failed. `crud.ts`'s admin `create` never writes an order directly, composing around `placeOrder`
 * instead, so it needs no compensation of its own — `placeOrder` already owns it.
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
        logger.error({
            message,
            orderId,
            error
        });
    };

    return (
        releaseHold
            ? inventoryService.releaseForOrder(orderId).catch(report('Rollback: hold not released'))
            : Promise.resolve()
    )
        .then(() => orderRepository.deleteOne(order))
        .catch(report('Rollback: order not deleted'));
};
