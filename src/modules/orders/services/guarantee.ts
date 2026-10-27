/**
 * @module
 * A repair under the legal guarantee pushes the guarantee out (Directive 2024/1799): the order's
 * `conformityUntil` moves twelve months on, once. `returns` asks, `orders` owns the field.
 *
 * See: docs/modules/returns.md#what-the-customer-gets-back
 */

import type { ClientSession } from 'mongoose';
import { repairedConformityUntil } from '../domain';
import { orderRepository } from '../repository';

/**
 * Extend an order's guarantee by twelve months, in the caller's transaction. Once per order: a
 * second repair, or an order that never arrived (no deadline yet), changes nothing.
 *
 * @param orderId - the order whose goods were repaired
 * @param session - the receipt's transaction
 * @returns whether the guarantee was extended by this call
 */
export const extendGuarantee = (orderId: string, session: ClientSession): Promise<boolean> =>
    orderRepository.findInSession(orderId, session).then((order) => {
        if (!order?.conformityUntil || order.conformityExtendedAt) return false;
        return orderRepository.extendConformity(
            orderId,
            order.conformityUntil,
            repairedConformityUntil(order.conformityUntil),
            session
        );
    });
