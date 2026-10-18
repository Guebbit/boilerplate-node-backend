/**
 * @module
 * Staff correcting where an unshipped order ships (`PUT /orders/{id}/shipping-address`): the door
 * a held `incorrect_address` fulfillment order needed, since nothing else could change an address
 * after checkout. Shopify lets staff edit the address of an unfulfilled fulfillment order the same
 * way; the buyer's own self-service edit is a later, optional step.
 *
 * The write, its timeline row and nothing else: the address stays encrypted under the order's id,
 * the audit row and the timeline name WHO changed it but never WHAT it says.
 *
 * See: docs/modules/orders.md#correcting-the-shipping-address
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { ERROR_CODES } from '@api/error-codes';
import type { CallerContext, OrderAddress } from '@types';
import { ordersAuditActions } from '../audit';
import { canCorrectAddress } from '../domain';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import { withTimeline } from './timeline';

/** The 409 for an order that no longer ships anywhere staff can redirect it to. */
const locked = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.ORDER_ADDRESS_LOCKED, message: t('orders.address.locked') }
    ]);

/**
 * Replace an order's shipping address while nothing has left.
 *
 * @param orderId - the order
 * @param address - the corrected address
 * @param context - the staff member, who holds `update:Order` (the route asked)
 * @returns the order as it now stands, a 404 for an unknown one, or a 409 once it shipped or
 *   when it has no shipping address at all (a pickup, a digital order)
 */
export const correctShippingAddress = (
    orderId: string,
    address: OrderAddress,
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository.findByIdScoped(orderId).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);
        if (!canCorrectAddress(order)) return locked();

        return withTransaction(
            withTimeline(
                (session) =>
                    orderRepository.replaceShippingAddress(orderId, order.status, address, session),
                () => [{ type: 'address_corrected', actor: context.caller.id }]
            )
        ).then((updated) => {
            // Lost a race against a dispatch or a status move since the read above.
            if (!updated) return locked();

            recordAudit(context, {
                action: ordersAuditActions.ADMIN_ORDER_ADDRESS_CORRECTED,
                outcome: 'success',
                targetType: 'order',
                targetId: orderId
            });
            return generateSuccess(updated);
        });
    });
