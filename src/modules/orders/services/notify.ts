/**
 * @module
 * The placed-order email, shared by `create` and `@modules/cart`'s checkout so neither can send a
 * different one for what {@link import('./place').placeOrder} actually wrote. Carries no
 * invoice: an order is not invoiced until it is paid (`invoicing`'s own `ORDER_STATUS_CHANGED`
 * listener), and this mail is sent at CREATION time, before that transition can have happened.
 */

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { userService } from '@modules/users';
import { ANONYMIZED_EMAIL } from '../domain/anonymization';
import { buyerIdOf } from '../domain';
import { orderConfirmEmail } from '../emails';
import type { OrderDocument } from '../model';

/**
 * Sends the placed-order email for an order `placeOrder` already wrote — the confirmation, with
 * the withdrawal notice, whatever the payment method. A `bank_transfer` order also gets its
 * instructions, in a second mail: that one is `payments`', sent when the transfer payment opens.
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

    const mail = orderConfirmEmail(locale, name, order, orderId);

    void enqueueEmail({ to: recipientEmail, subject: mail.subject }, mail.template, mail.data);
};

/**
 * The one buyer-mail policy `create`'s admin confirmation, `expireReservationById`'s bank-transfer-expired
 * notice and delivery's shipped notice all follow — see `docs/modules/orders.md`. Looks the buyer
 * up, then hands `build` the resolved locale and display name; `build` does the actual send
 * ({@link sendOrderPlacedEmail}, or a bare `enqueueEmail` call for a mail with no attachment).
 *
 * A failed lookup is logged and never blocks the mail: the display name falls back to the order's
 * own email, same as `build`'s own `name` parameter always has elsewhere. `build` itself runs
 * inside this function's own catch, so neither a rejected lookup nor a throwing `build` can ever
 * reject back into a caller — cancellation and shipment are both mid state-transition when they
 * call this, and a mail hiccup must not undo either.
 * An anonymised order is never mailed: its email is the placeholder, so `build` does not run.
 * @param order - the order the mail is about; `order.userId` is the account to look up, absent
 *   once a detach has erased it — `order.email` is the recipient unless the order was anonymised
 * @param build - given the resolved locale and display name, builds and sends the mail
 * @returns settles once `build` has run, for a caller that wants to sequence a next step after
 *   the mail (delivery's audit line); never rejects
 */
export const mailBuyer = (
    order: OrderDocument,
    build: (locale: string, name: string) => void
): Promise<void> => {
    // `.invalid` never resolves (RFC 6761 section 6.4): the mail would be a guaranteed bounce.
    if (order.email === ANONYMIZED_EMAIL) return Promise.resolve();
    const buyerId = buyerIdOf(order);
    return (buyerId ? userService.getById(buyerId) : Promise.resolve(undefined))
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
};
