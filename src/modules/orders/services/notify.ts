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
import { getDefaultLocale } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import {
    bankTransferBeneficiary,
    bankTransferIbanFriendly,
    transferInstructionsFor
} from '../config';
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
            // Stryker disable all
            logger.error({
                message: 'Invoice render failed; sending the placed-order email without it.',
                orderId,
                error
            });
            // Stryker restore all
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

    const mail =
        order.paymentMethod === 'bank_transfer' &&
        bankTransferBeneficiary() &&
        bankTransferIbanFriendly() &&
        order.payBy &&
        order.transferReference
            ? bankTransferInstructionsEmail(
                  locale,
                  name,
                  order,
                  transferInstructionsFor(order.transferReference),
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

/**
 * The one buyer-mail policy `create`'s admin confirmation, `cancelById`'s bank-transfer-expired
 * notice and delivery's shipped notice all follow — see `docs/modules/orders.md`. Looks the buyer
 * up, then hands `build` the resolved locale and display name; `build` does the actual send
 * ({@link sendOrderPlacedEmail}, or a bare `enqueueEmail` call for a mail with no attachment).
 *
 * A failed lookup is logged and never blocks the mail: the display name falls back to the order's
 * own email, same as `build`'s own `name` parameter always has elsewhere. `build` itself runs
 * inside this function's own catch, so neither a rejected lookup nor a throwing `build` can ever
 * reject back into a caller — cancellation and shipment are both mid state-transition when they
 * call this, and a mail hiccup must not undo either.
 * @param order - the order the mail is about; `order.userId` is the account to look up, absent
 *   once a detach has erased it — `order.email` is always the recipient
 * @param build - given the resolved locale and display name, builds and sends the mail
 * @returns settles once `build` has run, for a caller that wants to sequence a next step after
 *   the mail (delivery's audit line); never rejects
 */
export const mailBuyer = (
    order: OrderDocument,
    build: (locale: string, name: string) => void
): Promise<void> =>
    (order.userId ? userService.getById(String(order.userId)) : Promise.resolve(undefined))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: 'Buyer lookup failed; mailing the order with the fallback name.',
                orderId: String(order._id),
                error
            });
            // Stryker restore all
            return undefined;
        })
        .then((buyer) => {
            build(buyer?.locale ?? getDefaultLocale(), buyer?.username ?? order.email);
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: 'mailBuyer: sending the buyer mail failed.',
                orderId: String(order._id),
                error
            });
            // Stryker restore all
        });
