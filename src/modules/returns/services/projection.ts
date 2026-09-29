/**
 * @module
 * Keeping `orders`' `returnStatus` in step with the returns on it. `orders` cannot read this
 * module, so after every move that changes what a return holds — opened, decided, received, closed
 * — the owner reads its own returns, works out the word, and reports it through `orders`' own door.
 * Idempotent (the same returns write the same word), and a failed report is logged, never thrown:
 * the projection is a report of a fact already decided, and the next move re-stamps it.
 */

import { logger } from '@infrastructure/adapters/logger';
import { orderService } from '@modules/orders';
import { returnRepository } from '../repository';
import { projectReturnStatus } from '../domain';

/**
 * Recompute and report one order's `returnStatus`.
 * @param orderId - the order whose returns just changed
 * @returns settles once the report is made; never rejects
 */
export const syncReturnStatus = (orderId: string): Promise<void> =>
    Promise.all([returnRepository.findByOrderId(orderId), orderService.getById(orderId)])
        .then(([returns, order]) => {
            if (!order) return undefined;

            const ordered = new Map<string, number>();
            for (const item of order.items) {
                const productId = String(item.product._id);
                ordered.set(productId, (ordered.get(productId) ?? 0) + item.quantity);
            }
            const status = projectReturnStatus(
                returns.map(({ status: returnStatus, lines }) => ({
                    status: returnStatus,
                    lines: lines.map(({ productId, quantity }) => ({
                        productId: String(productId),
                        quantity
                    }))
                })),
                ordered
            );
            return orderService.markReturnStatus(orderId, status).then(() => undefined);
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Returns: could not report the return state to order ${orderId}`,
                error
            });
            // Stryker restore all
        });
