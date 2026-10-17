/**
 * @module
 * The emails delivery sends, each from a listener on its own event: "on its way" from
 * `shipment.shipped`, "arrived" from `shipment.delivered`, "preorder late" from
 * `fulfillment_order.delayed`. A listener covers every path that announces — staff, the status
 * override's follow-up, the daily sweep — and a crash after the commit still sends. A mail that
 * fails never undoes the act: `mailBuyerOfOrder` logs and swallows.
 */

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import type { DomainEventMap } from '@kernel/events';
import { OrderStatus } from '@types';
import { orderService } from '@modules/orders';
import { orderFrontendLink } from '@modules/orders';
import { preorderDelayedEmail, shipmentDeliveredEmail, shipmentShippedEmail } from '../emails';
import { shipmentRepository } from '../repository';
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
 * an account is still attached, plus the operator-facing log line. A digital fulfilment carries no
 * `remainingUnits` and is not mailed: it is born delivered, and its arrival mail says it all.
 *
 * @param payload - the `shipment.shipped` fact
 */
export const mailShipped = ({
    orderId,
    shipmentId,
    remainingUnits
}: DomainEventMap['shipment.shipped']): Promise<void> => {
    if (remainingUnits === undefined) return Promise.resolve();

    return shipmentRepository
        .findById(shipmentId)
        .then((shipment) =>
            shipment
                ? orderService.mailBuyerOfOrder(orderId, (order, locale, name) => {
                      const mail = shipmentShippedEmail(locale, name, {
                          lines: emailLines(shipment),
                          trackingCode: shipment.trackingCode,
                          remainingUnits
                      });
                      void enqueueEmail(
                          { to: order.email, subject: mail.subject },
                          mail.template,
                          mail.data
                      );
                      // Stryker disable next-line all
                      logger.info(
                          `Order ${orderId} shipment ${shipment.number} left as ${shipment.trackingCode ?? '(untracked)'}`
                      );
                  })
                : undefined
        )
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Delivery: could not mail the shipment ${shipmentId} notice`,
                error
            });
            // Stryker restore all
        });
};

/**
 * Tell the buyer a shipment arrived. When it completed the order the mail also says until when they
 * may withdraw: the order's own frozen deadline, read fresh, because the listener runs after the
 * act's transaction wrote it.
 *
 * @param payload - the `shipment.delivered` fact
 */
export const mailDelivered = ({
    orderId,
    shipmentId
}: DomainEventMap['shipment.delivered']): Promise<void> =>
    shipmentRepository
        .findById(shipmentId)
        .then((shipment) =>
            shipment
                ? orderService.mailBuyerOfOrder(orderId, (order, locale, name) => {
                      const mail = shipmentDeliveredEmail(locale, name, {
                          lines: emailLines(shipment),
                          withdrawUntil:
                              order.status === OrderStatus.delivered
                                  ? order.withdrawUntil
                                  : undefined
                      });
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
                message: `Delivery: could not mail the shipment ${shipmentId} arrival`,
                error
            });
            // Stryker restore all
        });

/**
 * Tell the buyer their waiting preorder is late, or that its date came with no stock: the notice
 * `recordNotice` committed. The notice is already a fact, and the inbox row and the order page say
 * the same.
 *
 * @param delayed - the `fulfillment_order.delayed` fact
 */
export const mailDelayed = (delayed: FulfillmentOrderDelayed): Promise<void> =>
    orderService.mailBuyerOfOrder(delayed.orderId, (order, locale, name) => {
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
