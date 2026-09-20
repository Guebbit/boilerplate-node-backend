/**
 * @module
 * The placed-order email — confirmation or transfer instructions, picked from the order's own
 * `paymentMethod` rather than by the caller, so `create` and `@modules/cart`'s checkout can never
 * pick the wrong one for what {@link import('./place').placeOrder} actually wrote. Both mails
 * carry the invoice, spooled as an attachment: the invoice number is allocated at creation, so it
 * does not wait on payment any more than the email itself does.
 */

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { spoolAttachment } from '@infrastructure/adapters/mail-spool';
import { bankTransferBeneficiary, bankTransferBic, bankTransferIbanFriendly } from '../config';
import { orderConfirmEmail, bankTransferInstructionsEmail } from '../emails';
import { renderInvoicePdf } from './invoice';
import type { OrderDocument } from '../model';

/** One `enqueueEmail` attachment — `{ filename, key }`, never bytes. */
interface MailAttachment {
    filename: string;
    key: string;
}

/**
 * Renders and spools the invoice for `sendOrderPlacedEmail` to attach. A render failure must
 * never lose the email itself — the confirmation is what the customer needs, the attachment is
 * what they'd like — so this resolves to no attachment at all rather than rejecting.
 *
 * @param orderId - the order to render
 * @param invoiceNumber - printed in the filename when present, the order id otherwise
 */
const invoiceAttachment = (
    orderId: string,
    invoiceNumber: string | undefined
): Promise<MailAttachment[]> =>
    renderInvoicePdf(orderId)
        .then((pdf) => {
            if (!pdf) return [];
            return spoolAttachment(pdf, 'pdf').then((key) => [
                { filename: `invoice-${invoiceNumber ?? orderId}.pdf`, key }
            ]);
        })
        .catch((error: unknown) => {
            logger.error({
                message: 'Invoice render failed; sending the placed-order email without it.',
                orderId,
                error
            });
            return [];
        });

/**
 * Sends the placed-order email for an order `placeOrder` already wrote. A `bank_transfer` order
 * gets the instructions and deadline instead of a confirmation — there is nothing to confirm yet —
 * provided the deployment still has a beneficiary/IBAN configured; an order minted while transfer
 * was offered but read back after it was turned off falls back to the plain confirmation rather
 * than an email with no way to pay.
 *
 * Fire-and-forget on purpose — every caller already `void`s it: rendering the invoice is a
 * Chromium launch, and that cost must never stretch out the request that placed the order.
 *
 * @param order - the order {@link import('./place').placeOrder} returned
 * @param locale - the buyer's own stored language, decided once so the order and the email never
 *   quote two different languages
 * @param name - the greeting's name — the buyer's username for a storefront checkout, or the
 *   email address itself for an admin-placed order with no separate display name on file
 * @param recipientEmail - where the mail goes; may differ from `order.email` for a caller acting
 *   on someone else's behalf
 */
export const sendOrderPlacedEmail = (
    order: OrderDocument,
    locale: string,
    name: string,
    recipientEmail: string
): void => {
    const orderId = String(order._id);
    const beneficiary = bankTransferBeneficiary();
    const iban = bankTransferIbanFriendly();
    const bic = bankTransferBic();

    const mail =
        order.paymentMethod === 'bank_transfer' &&
        beneficiary &&
        iban &&
        order.payBy &&
        order.transferReference
            ? bankTransferInstructionsEmail(
                  locale,
                  name,
                  order,
                  {
                      beneficiary,
                      iban,
                      ...(bic ? { bic } : {}),
                      reference: order.transferReference
                  },
                  order.payBy,
                  orderId
              )
            : orderConfirmEmail(locale, name, order, orderId);

    void invoiceAttachment(orderId, order.invoiceNumber).then((attachments) =>
        enqueueEmail(
            { to: recipientEmail, subject: mail.subject, attachments },
            mail.template,
            mail.data
        )
    );
};
