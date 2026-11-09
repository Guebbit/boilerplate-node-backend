/**
 * @module
 * The buyer's explanation of a cancel, sent from `order.canceled`'s listener. The cause on the
 * event picks the mail (`CANCEL_CAUSES[cause].mail`), so every door that cancels is explained the
 * same way, and a crash between the commit and the send still sends it.
 */

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import type { DomainEventMap } from '@kernel/events';
import { holdExpiredEmail, orderCanceledEmail } from '../emails';
import { CANCEL_CAUSES } from './cancel';
import { mailBuyerOfOrder } from './notify';

/**
 * Tell the buyer their order was canceled, or that its hold ran out unpaid. A bank transfer nobody
 * sent is answered by `payments`, which owns the transfer's deadline, so its expiry is not mailed
 * here. A cause with its own acknowledgement, or with nobody to tell, sends nothing.
 * @param payload - the `order.canceled` fact
 */
export const mailOrderCanceled = ({
    orderId,
    refund,
    cause
}: DomainEventMap['order.canceled']): Promise<void> => {
    const { mail: kind } = CANCEL_CAUSES[cause];
    if (kind === 'none') return Promise.resolve();

    return mailBuyerOfOrder(orderId, (order, locale, name) => {
        if (kind === 'reservation-expiry') {
            // Only a transfer is skipped: `payments` owns its deadline and mails its expiry.
            if (order.paymentMethod === 'bank_transfer') return;
            const mail = holdExpiredEmail(locale, order);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
            void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
            return;
        }
        // The one thing the buyer cannot see for themselves is what became of their money.
        const mail = orderCanceledEmail(locale, name, order, order.orderNumber, refund);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    });
};
