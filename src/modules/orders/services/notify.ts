/**
 * @module
 * The placed-order email — confirmation or transfer instructions, picked from the order's own
 * `paymentMethod` rather than by the caller, so `create` and `@modules/cart`'s checkout can never
 * pick the wrong one for what {@link import('./place').placeOrder} actually wrote.
 */

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { bankTransferBeneficiary, bankTransferBic, bankTransferIbanFriendly } from '../config';
import { orderConfirmEmail, bankTransferInstructionsEmail } from '../emails';
import type { OrderDocument } from '../model';

/**
 * Sends the placed-order email for an order `placeOrder` already wrote. A `bank_transfer` order
 * gets the instructions and deadline instead of a confirmation — there is nothing to confirm yet —
 * provided the deployment still has a beneficiary/IBAN configured; an order minted while transfer
 * was offered but read back after it was turned off falls back to the plain confirmation rather
 * than an email with no way to pay.
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

    void enqueueEmail({ to: recipientEmail, subject: mail.subject }, mail.template, mail.data);
};
