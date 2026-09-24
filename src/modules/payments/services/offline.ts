/**
 * @module
 * Recording money the provider never saw — cash at the counter, a phone order paid by transfer.
 * `recordOfflinePayment` writes the row and hands it to {@link settlePayment}, the SAME settlement
 * every card payment goes through: the order moves `pending → paid`, stock commits, and
 * `ORDER_STATUS_CHANGED`/`PAYMENT_SUCCEEDED` fire as usual. See `./index`'s module docblock for the
 * four rules every file here follows.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { PaymentMethod } from '@types';
import { orderService, orderTotal, isPayable, shopCurrency } from '@modules/orders';
import { recordAudit } from '@infrastructure/observability/audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import type { CallerContext } from '@types';
import { paymentRepository } from '../repository';
import { paymentsAuditActions } from '../audit';
import { paymentsAnalyticsEvents } from '../analytics';
import type { PaymentDocument } from '../model';
import { resolvePayerId } from './intent';
import { settlePayment, settlementResponse } from './settlement';
import { notPayable } from './errors';

/** The payment statuses a card charge may be sitting in while still reachable by the provider. */
const IN_FLIGHT_CARD_STATUSES = new Set(['requires_action', 'processing']);

/** What the admin sent, once the request body has been parsed against the contract. */
export interface OfflinePaymentInput {
    method: Exclude<PaymentMethod, 'card'>;
    reference?: string;
    receivedAt?: string;
}

/**
 * Record a payment that arrived outside the provider, and settle it exactly as a card payment
 * would.
 *
 * The order lookup is unscoped: this is an operator action reached only once `payments.any.create` has
 * already been checked at the route, not a customer reading their own order.
 *
 * @param orderId - the order the money arrived for
 * @param input - the method, an optional reference, and when the money actually arrived
 * @param context - the caller context to audit and analyse the attempt against — carries the
 *   admin's own identity, so a second `authContext` parameter would only repeat it
 */
// Flat `await`s, not a nested `.then()` pyramid, for the same reason `@modules/orders`'
// `crud.ts#create` uses them: each step below depends on the last one's resolved value.
export const recordOfflinePayment = async (
    orderId: string,
    input: OfflinePaymentInput,
    context: CallerContext
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> => {
    if (input.receivedAt && new Date(input.receivedAt).getTime() > Date.now())
        return generateReject(422, [t('payments.received-at-future')]);

    const order = await orderService.getById(orderId);
    if (!order) return generateReject(404, [t('payments.order-not-found')]);
    // Asked of the order lifecycle rather than compared against a literal here, so this
    // module cannot drift from the owner of the rule.
    if (!isPayable(order.status)) return notPayable();

    const existing = await paymentRepository.findByOrderId(orderId);
    // A card charge already at the provider: recording money by hand too could charge the
    // customer twice once that charge resolves on its own.
    if (existing && IN_FLIGHT_CARD_STATUSES.has(existing.status))
        return generateReject(409, [
            { code: 'PAYMENT_IN_FLIGHT', message: t('payments.in-flight') }
        ]);

    const payerId = await resolvePayerId(order.userId ? String(order.userId) : undefined);
    const payment = await paymentRepository.upsertOffline(orderId, payerId, {
        amount: orderTotal(order),
        currency: shopCurrency(),
        method: input.method,
        reference: input.reference,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date()
    });
    // Nothing to upsert onto: the order's own money already moved (succeeded or refunded),
    // raced past the `pending` check above.
    if (!payment) return notPayable();

    const settlement = await settlePayment(payment, { status: 'succeeded' });
    // Same refusal `confirmPayment`/`syncPayment` answer with when their own settlement loses
    // the order: the money moved but there was no order left to keep it for.
    if (settlement.orderLost) return settlementResponse(settlement);
    const { payment: settled } = settlement;

    recordAudit(context, {
        action: paymentsAuditActions.PAYMENT_RECORDED_OFFLINE,
        outcome: 'success',
        target_type: 'order',
        target_id: orderId,
        metadata: { method: input.method, reference: input.reference }
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: paymentsAnalyticsEvents.PAYMENT_RECORDED_OFFLINE,
        properties: {
            payment_id: String(settled._id),
            method: input.method
        }
    });

    return generateSuccess(settled, 201, t('payments.offline-recorded'));
};
