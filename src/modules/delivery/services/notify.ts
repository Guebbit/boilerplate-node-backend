/**
 * @module
 * The emails a shipment sends, once its transaction has committed: "on its way" when it leaves,
 * "arrived" when it is delivered. A mail that fails never undoes a shipment — `mailBuyer`'s own
 * policy logs the failed lookup and falls back to the address; the act is already a fact.
 */

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { OrderStatus } from '@types';
import { orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { orderFrontendLink } from '@modules/orders';
import { preorderDelayedEmail, shipmentDeliveredEmail, shipmentShippedEmail } from '../emails';
import type { FulfillmentOrderDelayed } from '../events';
import type { ShipmentDocument } from '../model';

/**
 * What a shipment carries, as an email lists it.
 * @param shipment - the shipment
 */
const emailLines = (shipment: ShipmentDocument) =>
    shipment.lines.map(({ title, quantity }) => ({ title, quantity }));

/**
 * Tell the buyer a shipment left — the carrier email, addressed in the buyer's own language when
 * an account is still attached, plus the operator-facing log line. `order.userId` is absent once a
 * detach has erased the account, and a lookup that fails for any other reason is `mailBuyer`'s own
 * policy to log and fall back on.
 *
 * @param order - the order the shipment belongs to
 * @param shipment - the shipment that left
 * @param remainingUnits - units still to come in later shipments
 */
export const notifyShipped = (
    order: OrderDocument,
    shipment: ShipmentDocument,
    remainingUnits: number
): Promise<void> =>
    orderService.mailBuyer(order, (locale, name) => {
        const mail = shipmentShippedEmail(locale, name, {
            lines: emailLines(shipment),
            trackingCode: shipment.trackingCode,
            remainingUnits
        });
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
        // Stryker disable next-line all
        logger.info(
            `Order ${String(order._id)} shipment ${shipment.number} left as ${shipment.trackingCode ?? '(untracked)'}`
        );
    });

/**
 * Tell the buyer a shipment arrived. When it completed the order the mail also says until when they
 * may withdraw: the order's own frozen deadline, read fresh, because it was written in the act's
 * transaction and `order` here was read before it.
 *
 * @param orderId - the order the shipment belongs to
 * @param shipment - the shipment that arrived
 */
export const notifyDelivered = (orderId: string, shipment: ShipmentDocument): Promise<void> =>
    orderService.getById(orderId).then((order) => {
        if (!order) return undefined;
        const withdrawUntil =
            order.status === OrderStatus.delivered ? order.withdrawUntil : undefined;
        return orderService.mailBuyer(order, (locale, name) => {
            const mail = shipmentDeliveredEmail(locale, name, {
                lines: emailLines(shipment),
                withdrawUntil
            });
            void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
        });
    });

/**
 * Tell the buyer their waiting preorder is late, or that its date came with no stock: the notice
 * `recordNotice` just committed. Sent after the commit and best-effort, like every email here — the
 * notice is already a fact, and the inbox row and the order page say the same.
 *
 * @param order - the order the fulfillment order belongs to
 * @param delayed - what the notice says
 */
export const notifyDelayed = (
    order: OrderDocument,
    delayed: FulfillmentOrderDelayed
): Promise<void> =>
    orderService.mailBuyer(order, (locale, name) => {
        const mail = preorderDelayedEmail(locale, name, {
            titles: delayed.titles,
            agreedAt: new Date(delayed.agreedAt),
            ...(delayed.expectedAt ? { expectedAt: new Date(delayed.expectedAt) } : {}),
            needsAnswer: delayed.needsAnswer,
            ...(delayed.answerBy ? { answerBy: new Date(delayed.answerBy) } : {}),
            orderUrl: orderFrontendLink({ locale, id: String(order._id) })
        });
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    });
