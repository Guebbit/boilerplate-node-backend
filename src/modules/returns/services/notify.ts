/**
 * @module
 * Mailing the customer about a return or a withdrawal — `orders`' own buyer-mail policy
 * (`mailBuyer`: look the buyer up for their language, fall back rather than block) with this
 * module's copy. Never rejects: every caller is mid state-change, and a mail hiccup must not undo
 * one.
 */

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { mailBuyer } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { returnNoticeEmail, type ReturnNoticeInput, type ReturnNoticeKind } from '../emails';

/**
 * Send one notice about an order's return, in the buyer's own language.
 *
 * @param kind - which notice
 * @param order - the order it is about
 * @param input - what fills the copy; the order reference is derived here
 * @returns settles once the mail is queued; never rejects
 */
export const mailReturnNotice = (
    kind: ReturnNoticeKind,
    order: OrderDocument,
    input: Omit<ReturnNoticeInput, 'orderRef'>
): Promise<void> =>
    mailBuyer(order, (locale, name) => {
        const mail = returnNoticeEmail(kind, locale, name, {
            ...input,
            orderRef: order.orderNumber ?? String(order._id)
        });
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    });
