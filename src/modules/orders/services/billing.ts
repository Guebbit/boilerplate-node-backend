/**
 * @module
 * Staff correcting who an order is invoiced to (`PUT /orders/{id}/billing-address`): the name,
 * address or VAT number the buyer wrote in about. The twin of `./address.ts`, with one difference
 * that matters: this write may follow an invoice that already exists. `orders` never touches the
 * invoice. It announces the fact in the write's own transaction (`order.billing_corrected`), and
 * `invoicing` cancels and reissues the invoice off that event, no money moving.
 *
 * The write, its timeline row and the event: the address stays encrypted under the order's id, the
 * audit row and the timeline name WHO changed it but never WHAT it says.
 *
 * @see docs/modules/orders.md#correcting-the-billing-address
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { announceInTransaction } from '@kernel/outbox';
import { ERROR_CODES } from '@api/error-codes';
import type { CallerContext, OrderBillingAddress } from '@types';
import { ordersAuditActions } from '../audit';
import { canCorrectBilling, isSameBillingAddress } from '../domain';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import { billingCorrectedEvent } from './announce';
import { billingAddressOf } from './read';
import { withTimeline } from './timeline';

/** The 409 for an order whose personal data retention already erased. */
const locked = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.ORDER_BILLING_LOCKED, message: t('orders.billing.locked') }
    ]);

/**
 * Replace who the order is invoiced to. Idempotent: an address equal to the current one answers 200
 * and writes nothing. Accepted at any status: an order not invoiced yet simply
 * freezes the corrected address into its future invoice, and one already invoiced has it cancelled
 * and reissued by `invoicing`, off the event this write announces.
 *
 * @param orderId - the order whose billing address staff correct
 * @param address - the corrected billing address, the VAT number included; replaces the old one whole
 * @param context - the staff member, who holds `update:Order` (the route asked)
 * @returns the order as it now stands, a 404 for an unknown one, or a 409 once the order is anonymised
 */
export const correctBillingAddress = (
    orderId: string,
    address: OrderBillingAddress,
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository.findByIdScoped(orderId).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);
        if (!canCorrectBilling(order)) return locked();
        // A repeat of what the order already says changes nothing: no row, no event, no audit.
        if (isSameBillingAddress(billingAddressOf(order), address)) return generateSuccess(order);

        return announceInTransaction(
            withTimeline(
                (session) => orderRepository.replaceBillingAddress(orderId, address, session),
                () => [{ type: 'billing_corrected', actor: context.caller.id }]
            ),
            (updated) => billingCorrectedEvent(String(updated._id))
        ).then((updated) => {
            // Anonymised by the retention sweep since the read above.
            if (!updated) return locked();

            recordAudit(context, {
                action: ordersAuditActions.ADMIN_ORDER_BILLING_CORRECTED,
                outcome: 'success',
                targetType: 'order',
                targetId: orderId
            });
            return generateSuccess(updated);
        });
    });
