/**
 * @module
 * Giving money back — the operator action (`refundByOrder`) and the `ORDER_CANCELLED` listener's
 * compensation (`refundForOrder`), both through the one conditional write (`performRefund`) that
 * makes a refund at-most-once. Nothing else in this module may move money out.
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { PaymentStatus, AuthContext } from '@types';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { paymentsAuditActions } from '../audit';
import { resolvePaymentProvider } from '../providers';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import { callerScope } from './scope';

/** The only status money can come back from: it has to have arrived first. */
export const REFUNDABLE_PAYMENT_STATUS: PaymentStatus = 'succeeded';

/**
 * Refund an order's payment — the operator action, and the listener's compensation.
 *
 * The conditional `succeeded → refunded` move IS the idempotence: a second call finds nothing in
 * `succeeded` and answers `null`, which the two callers read differently. Nothing else in this
 * module may move money, so both paths come through here.
 *
 * @param orderId - the order whose payment is being returned
 * @param context - present only for the admin request (`refundByOrder`); the cancel listener
 *  (`refundForOrder`) has none, and audits nothing, same as the token-cleanup job.
 * @returns the refunded payment, or `null` when there was nothing to return
 */
export const performRefund = (
    orderId: string,
    context?: CallerContext
): Promise<PaymentDocument | null> =>
    paymentRepository
        .updateStatusIfIn(orderId, [REFUNDABLE_PAYMENT_STATUS], 'refunded')
        .then((payment) => {
            if (!payment) return null;
            if (!payment.providerRef) {
                // Only a `succeeded` payment reaches here, and nothing can succeed before the
                // provider has been asked for an intent — so this is a corrupted row, not a
                // reachable state. Loud, and the status still moves: leaving it `succeeded` would
                // invite a second attempt at the same impossible refund.
                logger.error({
                    message:
                        'Refunded a payment carrying no provider reference — money was NOT returned.',
                    orderId
                });
                return payment;
            }
            return resolvePaymentProvider()
                .refund(payment.providerRef, { amount: payment.amount, currency: payment.currency })
                .then(() => {
                    logger.info(
                        `Payment for order ${orderId} refunded (${payment.amount} ${payment.currency})`
                    );
                    if (context)
                        emitAuditEvent(
                            buildAuditEvent(context, {
                                action: paymentsAuditActions.ADMIN_PAYMENT_REFUNDED,
                                outcome: 'success',
                                target_type: 'order',
                                target_id: orderId
                            })
                        );
                    return payment;
                });
        });

/**
 * `POST /payments/order/:orderId/refund` — the operator returning money on its own, separate
 * from cancelling. Admin-only at the route.
 *
 * @param orderId - the order whose payment is being returned
 * @param authContext - the caller, for the read that distinguishes 404 from 409
 * @param context - the caller context to audit the refund against
 * @returns the refunded payment, or a refusal naming which case it was
 */
export const refundByOrder = (
    orderId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<PaymentDocument> | ResponseReject> =>
    performRefund(orderId, context).then((refunded) => {
        if (refunded) return generateSuccess(refunded, 200, t('payments.refund-success'));

        // Nothing moved. Which refusal it was is a second read, exactly as the order cancel does:
        // the decision is already made, and this only chooses the sentence.
        return paymentRepository.findByOrderId(orderId, callerScope(authContext)).then((payment) =>
            payment
                ? generateReject(409, [
                      {
                          code: 'PAYMENT_NOT_REFUNDABLE',
                          message: t('payments.not-refundable')
                      }
                  ])
                : generateReject(404, [t('payments.not-found')])
        );
    });

/**
 * `ORDER_CANCELLED`'s listener: give the money back if any was taken.
 *
 * The conditional `succeeded → refunded` move is the idempotence — a second event, or a cancel
 * of a never-paid order, finds nothing in `succeeded` and does nothing. Unattended, so the
 * outcome is logged rather than audited, same as the token-cleanup job's.
 *
 * @param orderId - the order that was cancelled
 */
export const refundForOrder = (orderId: string): Promise<void> =>
    performRefund(orderId).then(() => undefined);
