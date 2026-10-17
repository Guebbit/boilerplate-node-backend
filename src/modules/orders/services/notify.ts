/**
 * @module
 * The placed-order email, sent from `order.created`'s listener so `create` and `@modules/cart`'s
 * checkout cannot send a different one for what {@link import('./place').placeOrder} wrote. Carries no
 * invoice: an order is not invoiced until it is paid (`invoicing`'s own `ORDER_STATUS_CHANGED`
 * listener), and this mail is sent at CREATION time, before that transition can have happened.
 */

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import type { DomainEventMap } from '@kernel/events';
import { getDefaultLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { userService } from '@modules/users';
import { ANONYMIZED_EMAIL } from '../domain/anonymization';
import { buyerIdOf } from '../domain';
import { orderConfirmEmail } from '../emails';
import type { OrderDocument } from '../model';
import { getById } from './read';

/**
 * The one buyer-mail policy every customer mail follows — see `docs/tools/outbox.md#customer-mail`.
 * Looks the buyer up, then hands `build` the resolved locale and display name; `build` does the
 * actual send, a bare `enqueueEmail` call.
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

/**
 * {@link mailBuyer} for a mail sent from an outbox-event listener: reads the order by id, then
 * hands `build` the order beside the resolved locale and name. An order that is gone is skipped.
 * Never rejects — a listener that rejects makes the relay deliver the event again, and a mail that
 * failed is not worth a second delivery of everything else the event carries.
 * @param orderId - the order the event is about
 * @param build - given the order, the locale and the display name, builds and sends the mail
 */
export const mailBuyerOfOrder = (
    orderId: string,
    build: (order: OrderDocument, locale: string, name: string) => void
): Promise<void> =>
    getById(orderId)
        .then((order) =>
            order ? mailBuyer(order, (locale, name) => build(order, locale, name)) : undefined
        )
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Orders: could not mail the buyer of order ${orderId}`,
                error
            });
            // Stryker restore all
        });

/**
 * Tell the buyer their order was placed: the confirmation, with the withdrawal notice, whatever
 * the payment method. `order.created`'s listener, so the admin create and the storefront checkout
 * send the same mail from the one place, and a crash after the commit still sends it. A
 * `bank_transfer` order also gets its instructions, in a second mail: that one is `payments`'.
 * @param payload - the `order.created` fact
 */
export const mailOrderPlaced = ({ orderId }: DomainEventMap['order.created']): Promise<void> =>
    mailBuyerOfOrder(orderId, (order, locale, name) => {
        const mail = orderConfirmEmail(locale, name, order, orderId);
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    });
