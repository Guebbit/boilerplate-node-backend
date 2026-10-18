/**
 * @module
 * The mails this module sends. Two are listeners on its own events — `payment.succeeded` and
 * `payment.refunded` — and two belong to the bank transfer: its instructions, when the transfer
 * payment opens, and "no transfer received", when its order is cancelled for lack of one. A listener covers every path that settles money — the webhook, the
 * browser confirm, an offline record and the crash-recovery sweep — where an inline send would
 * miss the ones that only announce. A mail that fails never undoes money that landed: both
 * listeners log and swallow.
 */

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import type { DomainEventMap } from '@kernel/events';
import { RefundStatus } from '@types';
import { toMinorUnits } from '@domain-primitives/money';
import { orderService } from '@modules/orders';
import {
    paymentReceivedEmail,
    refundIssuedEmail,
    transferExpiredEmail,
    transferInstructionsEmail
} from '../emails';
import { bankTransferBeneficiary, bankTransferBic, bankTransferIbanFriendly } from '../config';
import { paymentRepository } from '../repository';
import type { PaymentDocument, RefundRecord } from '../model';

/**
 * Whether a settled refund moved real money: the provider named it, or an operator reported
 * returning a hand-paid one. The corrupted-row case settles a record with neither.
 * @param payment - the payment the refund belongs to
 * @param refund - the settled record
 */
const moneyWentBack = (payment: PaymentDocument, refund: RefundRecord): boolean =>
    Boolean(refund.providerRefundRef) || payment.refundedByHand === true;

/**
 * Whether this refund completed the payment: everything settled up to and including it adds up
 * to the whole amount. Read from the records, never from the payment's current status — a later
 * refund would otherwise change what an earlier one says.
 * @param payment - the payment the refund belongs to
 * @param refund - the settled record
 */
const completesPayment = (payment: PaymentDocument, refund: RefundRecord): boolean => {
    const settledAt = refund.settledAt?.getTime() ?? Infinity;
    const refundedMinor = payment.refunds
        .filter(
            (record) =>
                record.status === RefundStatus.succeeded &&
                (String(record._id) === String(refund._id) ||
                    (record.settledAt?.getTime() ?? Infinity) <= settledAt)
        )
        .reduce((sum, record) => sum + toMinorUnits(record.amount, record.currency), 0);
    return refundedMinor === toMinorUnits(payment.amount, payment.currency);
};

/**
 * Tell the buyer their payment landed. The order-placed mail only ever said the order was
 * received, so this is the buyer's answer to "did my card go through".
 * @param payload - the `payment.succeeded` fact
 */
export const mailPaymentReceived = ({
    orderId
}: DomainEventMap['payment.succeeded']): Promise<void> =>
    orderService
        .getById(orderId)
        .then((order) =>
            order
                ? orderService.mailBuyer(order, (locale, name) => {
                      const mail = paymentReceivedEmail(locale, name, order, orderId);
                      void enqueueEmail(
                          { to: order.email, subject: mail.subject },
                          mail.template,
                          mail.data
                      );
                  })
                : undefined
        )
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not mail the payment confirmation for order ${orderId}`,
                error
            });
            // Stryker restore all
        });

/**
 * Tell the buyer their money went back, when it went back outside a return. A return's refund is
 * announced by `returns`' own closing notice, so a `return` refund carrying a `returnId` is
 * skipped; a cancellation's refund carries one too (a remainder cancel) but has no closing
 * notice, so it is mailed here. A refund that moved no money is skipped too.
 * @param payload - the `payment.refunded` fact
 */
export const mailRefundIssued = ({
    orderId,
    refundId
}: DomainEventMap['payment.refunded']): Promise<void> =>
    Promise.all([paymentRepository.findByOrderId(orderId), orderService.getById(orderId)])
        .then(([payment, order]) => {
            const refund = payment?.refunds.find((record) => String(record._id) === refundId);
            if (!payment || !order || !refund) return undefined;
            if (refund.returnId && refund.reason !== 'cancellation') return undefined;
            if (!moneyWentBack(payment, refund)) return undefined;
            return orderService.mailBuyer(order, (locale, name) => {
                const mail = refundIssuedEmail(
                    locale,
                    name,
                    order.orderNumber,
                    { amount: refund.amount, currency: refund.currency },
                    completesPayment(payment, refund)
                );
                void enqueueEmail(
                    { to: order.email, subject: mail.subject },
                    mail.template,
                    mail.data
                );
            });
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not mail the refund notice for order ${orderId}`,
                error
            });
            // Stryker restore all
        });

/**
 * Tell the buyer where to send the money and by when. Sent by the call that opened the transfer
 * payment, so a redelivered `order.created` mails once. A mail that fails is logged and swallowed:
 * the payment exists, and the buyer can read the same instructions on the order page.
 *
 * @param order - the order the transfer pays for
 * @param payment - the transfer payment just opened
 */
export const mailTransferInstructions = (
    order: NonNullable<Awaited<ReturnType<typeof orderService.getById>>>,
    payment: PaymentDocument
): Promise<void> => {
    const beneficiary = bankTransferBeneficiary();
    const iban = bankTransferIbanFriendly();
    const { transferReference, payBy } = payment;
    if (!beneficiary || !iban || !transferReference || !payBy) return Promise.resolve();

    return orderService
        .mailBuyer(order, (locale, name) => {
            const bic = bankTransferBic();
            const mail = transferInstructionsEmail(
                locale,
                name,
                order,
                { beneficiary, iban, ...(bic ? { bic } : {}), reference: transferReference },
                payBy,
                String(order._id)
            );
            void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not mail the transfer instructions for order ${String(order._id)}`,
                error
            });
            // Stryker restore all
        });
};

/**
 * Tell the buyer their transfer did not arrive in time and the order is cancelled. Sent by the
 * call that moved the transfer payment to `cancelled`, so one cancel mails once.
 *
 * @param orderId - the order that was cancelled
 */
export const mailTransferExpired = (orderId: string): Promise<void> =>
    orderService
        .getById(orderId)
        .then((order) =>
            order
                ? orderService.mailBuyer(order, (locale) => {
                      const mail = transferExpiredEmail(locale, order);
                      void enqueueEmail(
                          { to: order.email, subject: mail.subject },
                          mail.template,
                          mail.data
                      );
                  })
                : undefined
        )
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Payments: could not mail the transfer-expired notice for order ${orderId}`,
                error
            });
            // Stryker restore all
        });
