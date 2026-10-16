/**
 * @module
 * The payment of a bank transfer. A transfer order has money owed from the moment it is placed, so
 * it gets its payment then: `order.created` opens a `requires_action` row that carries the RF
 * reference, the deadline and, on the wire, the instructions (`nextAction`). The row is what an
 * operator later finds by reference, records the money on (`./offline`) and settles through the
 * same `settlePayment` every payment goes through.
 *
 * See: docs/modules/payments.md#bank-transfer
 */

import { logger } from '@infrastructure/adapters/logger';
import { buyerIdOf, isPayable, orderService, orderTotal } from '@modules/orders';
import { buildReference } from '../domain';
import { bankTransferEnabled } from '../config';
import { paymentRepository } from '../repository';
import { mailTransferInstructions } from './notify';

/**
 * `order.created`'s listener: open the transfer payment of an order placed with `bank_transfer`.
 * Idempotent under the outbox's at-least-once delivery — the row is inserted only when absent, and
 * the instructions are mailed only by the call that inserted it. An order that is not a transfer,
 * not payable any more, or placed by a deployment that has since stopped offering transfers, opens
 * nothing; a payment that already exists (a card paid first, an operator recorded the money) is
 * left exactly as it is.
 *
 * @param orderId - the order just placed
 */
export const openTransferPayment = (orderId: string): Promise<void> =>
    orderService.getById(orderId).then((order) => {
        if (order?.paymentMethod !== 'bank_transfer' || !order.payBy || !isPayable(order.status))
            return undefined;

        return paymentRepository
            .openTransfer(orderId, buyerIdOf(order), {
                amount: orderTotal(order),
                currency: order.currency,
                transferReference: buildReference(orderId),
                payBy: order.payBy
            })
            .then((opened) => {
                if (!opened?.created) return undefined;
                if (!bankTransferEnabled()) {
                    // Opened, but with nothing to tell the buyer: say so, for the operator.
                    logger.warn(
                        `Payments: order ${orderId} chose bank transfer but this deployment no longer offers it — no instructions were sent`
                    );
                    return undefined;
                }
                return mailTransferInstructions(order, opened.payment);
            });
    });
