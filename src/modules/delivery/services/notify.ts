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
import {
    holdNoticeEmail,
    fulfillmentDelayedEmail,
    shipmentDeliveredEmail,
    shipmentLostEmail,
    shipmentShippedEmail,
    type TrackingVariant
} from '../emails';
import { shipmentRepository } from '../repository';
import type { FulfillmentOrderDelayed, FulfillmentOrderHoldNoticed } from '../events';
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
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
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
 * Tell the buyer the tracking code of a shipment changed: the same mail as when it left, with its
 * own subject. `added` is the first code of a parcel that left without one; `corrected` replaces a
 * code already sent and apologises for it. Best effort, after the save: a queue that is briefly
 * down must not turn a saved code into an error.
 *
 * @param shipment - the shipment as it now stands, carrying the new code
 * @param variant - whether the code is new or replaces one
 */
export const mailTrackingChanged = (
    shipment: ShipmentDocument,
    variant: TrackingVariant
): Promise<void> =>
    orderService
        .mailBuyerOfOrder(String(shipment.orderId), (order, locale, name) => {
            const mail = shipmentShippedEmail(locale, name, {
                lines: emailLines(shipment),
                trackingCode: shipment.trackingCode,
                remainingUnits: 0,
                variant
            });
            // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
            void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
        })
        .catch((error: unknown) => {
            logger.warn({
                message: `Delivery: could not mail the new code of shipment ${String(shipment._id)}`,
                error
            });
        });

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
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
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
 * Tell the buyer a parcel of theirs was reported lost or damaged: a fixed text per reason, what it
 * carried, the units still owed with the date they are expected, and staff's sentence if there is
 * one. Always sent: there is no switch, since a buyer who waits for a parcel that will not come
 * must hear it from the shop. A mail that fails never undoes the loss.
 *
 * @param lost - the `shipment.lost` fact
 */
export const mailLost = (lost: DomainEventMap['shipment.lost']): Promise<void> =>
    shipmentRepository
        .findById(lost.shipmentId)
        .then((shipment) =>
            shipment
                ? orderService.mailBuyerOfOrder(lost.orderId, (order, locale, name) => {
                      const mail = shipmentLostEmail(locale, name, {
                          reason: lost.reason,
                          lines: emailLines(shipment),
                          owed: lost.owed,
                          ...(lost.expectedAt ? { expectedAt: new Date(lost.expectedAt) } : {}),
                          message: lost.message,
                          orderUrl: orderFrontendLink({ locale, id: String(order._id) })
                      });
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
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
                message: `Delivery: could not mail the loss of shipment ${lost.shipmentId}`,
                error
            });
            // Stryker restore all
        });

/**
 * Tell the buyer their waiting preorder is late, or that its date came with no stock: the notice
 * `recordNotice` committed. It asks for nothing; the buyer can cancel from the order page. The notice is already a fact, and the inbox row and the order page say
 * the same.
 *
 * @param delayed - the `fulfillment_order.delayed` fact
 */
export const mailDelayed = (delayed: FulfillmentOrderDelayed): Promise<void> =>
    orderService.mailBuyerOfOrder(delayed.orderId, (order, locale, name) => {
        const mail = fulfillmentDelayedEmail(locale, name, {
            titles: delayed.titles,
            agreedAt: new Date(delayed.agreedAt),
            ...(delayed.expectedAt ? { expectedAt: new Date(delayed.expectedAt) } : {}),
            reason: delayed.reason,
            orderUrl: orderFrontendLink({ locale, id: String(order._id) })
        });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    });

/**
 * Tell the buyer a hold needs their eye: an address to check, or a message staff wrote. The
 * notice is already a fact; the inbox row and the order page say the same.
 *
 * @param held - the `fulfillment_order.hold_noticed` fact
 */
export const mailHoldNoticed = (held: FulfillmentOrderHoldNoticed): Promise<void> =>
    orderService.mailBuyerOfOrder(held.orderId, (order, locale, name) => {
        const mail = holdNoticeEmail(locale, name, {
            notice: held.notice,
            message: held.message,
            orderUrl: orderFrontendLink({ locale, id: String(order._id) })
        });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    });
