/**
 * @module
 * Giving money back — the operator action (`refundByOrder`) and the `ORDER_REFUND_OWED` listener's
 * compensation (`refundForOrder`), both through the one conditional write (`performRefund`) that
 * makes a refund at-most-once. Nothing else in this module may move money out.
 *
 * `performRefund` asks the provider FIRST and moves the status only once it confirms (B1): a
 * rejection then leaves the payment `succeeded`, the one state the retry sweep (`ORDER_REFUND_OWED`,
 * see `../module.ts`) can still act on — instead of a refund being recorded as done before anyone
 * asked, with no way back once the provider says no.
 *
 * It dispatches on the PAYMENT's own `provider`, never on the deployment's configured one (B1c): a
 * `manual` payment has no provider to ask, and a real PSP refund must go back to whichever provider
 * actually took the money, even if the deployment has since switched to another.
 */

import { logger } from '@infrastructure/adapters/logger';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { PaymentStatus, AuthContext } from '@types';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { SYSTEM_ACTOR, callerForSubject } from '@kernel/permissions';
import { paymentsAuditActions } from '../audit';
import { providerNamed } from '../providers';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';
import { callerScope } from './scope';

/** The only status money can come back from: it has to have arrived first. */
export const REFUNDABLE_PAYMENT_STATUS: PaymentStatus = 'succeeded';

/**
 * Record, unattended, that a hand-paid order's refund is left for an operator (B1b) — the
 * automatic listener path only; `refundByOrder`'s own admin call never reaches this.
 * @param orderId - the order whose payment stays `succeeded` until an operator confirms it
 * @param payment - the payment left untouched
 */
const leaveForOperator = (orderId: string, payment: PaymentDocument): Promise<PaymentDocument> => {
    // Stryker disable all
    logger.warn(
        `Payment for order ${orderId} was paid by hand — left \`succeeded\` for an operator to confirm the money actually went back.`
    );
    // Stryker restore all
    recordAudit(
        { caller: callerForSubject(SYSTEM_ACTOR, 'Payment'), analyticsConsent: false },
        {
            action: paymentsAuditActions.PAYMENT_REFUND_OWED_BY_HAND,
            outcome: 'success',
            actor_role: 'admin',
            actor_user_id: 'system',
            target_type: 'order',
            target_id: orderId
        }
    );
    return Promise.resolve(payment);
};

/**
 * Move a `succeeded` payment to `refunded`, once the money has actually moved (or, for a hand-paid
 * one, once an operator says it has). The conditional write IS the idempotence: a second call
 * finds nothing left in `succeeded` and answers `null`.
 * @param orderId - the order whose payment is moving
 * @param context - present only for the admin request; audited only then
 * @param extra - `{ refundedByHand: true }` for the admin confirming a hand-paid refund
 */
const markRefunded = (
    orderId: string,
    context: CallerContext | undefined,
    extra?: Partial<PaymentDocument>
): Promise<PaymentDocument | null> =>
    paymentRepository
        .updateStatusIfIn(orderId, [REFUNDABLE_PAYMENT_STATUS], 'refunded', extra)
        .then((updated) => {
            if (!updated) return null;
            // Stryker disable all
            logger.info(
                `Payment for order ${orderId} refunded (${updated.amount} ${updated.currency})`
            );
            // Stryker restore all
            recordAudit(context, {
                action: paymentsAuditActions.ADMIN_PAYMENT_REFUNDED,
                outcome: 'success',
                target_type: 'order',
                target_id: orderId
            });
            return updated;
        });

/**
 * Refund an order's payment — the operator action, and the listener's compensation.
 *
 * @param orderId - the order whose payment is being returned
 * @param context - present only for the admin request (`refundByOrder`); the cancel listener
 *  (`refundForOrder`) has none, and audits nothing, same as the token-cleanup job. Also what tells
 *  a hand-paid refund apart from the two callers (B1b): present means the operator asked, absent
 *  means the automatic listener did.
 * @returns the payment as it now stands — `refunded` on success, still `succeeded` when a hand-paid
 *   refund is left for an operator — or `null` when there was nothing to return
 */
export const performRefund = (
    orderId: string,
    context?: CallerContext
): Promise<PaymentDocument | null> =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (payment?.status !== REFUNDABLE_PAYMENT_STATUS) return null;

        // Money recorded by hand has no provider to ask. Only the operator's own call (`context`
        // present) may say the cash went back; the automatic listener leaves it standing (B1b).
        if (payment.provider === 'manual')
            return context
                ? markRefunded(orderId, context, { refundedByHand: true })
                : leaveForOperator(orderId, payment);

        if (!payment.providerRef) {
            // Only a `succeeded` payment reaches here, and nothing can succeed before the
            // provider has been asked for an intent — so this is a corrupted row, not a
            // reachable state. Loud, and the status still moves: leaving it `succeeded` would
            // invite a second attempt at the same impossible refund.
            // Stryker disable all
            logger.error({
                message:
                    'Refunded a payment carrying no provider reference — money was NOT returned.',
                orderId
            });
            // Stryker restore all
            return markRefunded(orderId, context);
        }

        // The idempotency key is what makes a RETRY safe at the provider itself (B1): two calls
        // for this payment — a redelivered retry, an operator's double-click — carry the same key,
        // so the provider returns the same refund instead of returning the money twice. A rejection
        // here propagates: the payment stays `succeeded`, exactly what the retry sweep needs.
        return providerNamed(payment.provider)
            .refund(
                payment.providerRef,
                { amount: payment.amount, currency: payment.currency },
                { idempotencyKey: `refund:${String(payment._id)}` }
            )
            .then(() => markRefunded(orderId, context));
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
 * `ORDER_REFUND_OWED`'s listener: give the money back if any was taken.
 *
 * The conditional `succeeded → refunded` move is the idempotence — a second event, or a cancel
 * of a never-paid order, finds nothing in `succeeded` and does nothing. Unattended, so the
 * outcome is logged rather than audited, same as the token-cleanup job's.
 *
 * @param orderId - the order that was cancelled
 */
export const refundForOrder = (orderId: string): Promise<void> =>
    performRefund(orderId).then(() => undefined);
