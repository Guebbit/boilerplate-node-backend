/**
 * @module
 * What each shop event becomes in the inbox: a buyer's message (a lost parcel, a delayed preorder,
 * a back-in-stock answer…) or a work notice for the staff who can act on it (a purchase hold, a
 * return to decide). One function per event, each a mapping from a payload to the rows to write;
 * `notifications` does the writing, the cap and the live push. The staff notices carry their own
 * routing and link (`../staff-routing`), since `notifications` knows none of these codes.
 *
 * Own-message severity is `warning` throughout, except a back-in-stock answer: each says
 * "something you had changed without you asking", which is worth a look and not an error.
 *
 * See: docs/modules/shop-tasks.md
 */

import { Types } from 'mongoose';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { DomainEventMap } from '@kernel/events';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import { notificationsService } from '@modules/notifications';
import { SHOP_STAFF_ROUTES } from '../staff-routing';

/** One row per owner of a removed product, all the same message. */
const removedFor = (
    code: 'shop-tasks.cart-line-removed' | 'shop-tasks.wishlist-item-removed',
    { userIds, productId, titles }: DomainEventMap['cart.lines_removed']
) =>
    userIds.map((userId) => ({
        userId: new Types.ObjectId(userId),
        code,
        severity: 'warning' as const,
        params: { productId, titles }
    }));

/** The shop's notices, by the event that causes them; `module.ts` subscribes each. */
export const shopNotices = {
    /** A product left the catalogue and with it these users' carts. */
    onCartLinesRemoved: (payload: DomainEventMap['cart.lines_removed']): Promise<void> =>
        notificationsService.create(removedFor('shop-tasks.cart-line-removed', payload)),

    /** A product left the catalogue and with it these users' wishlists. */
    onWishlistItemsRemoved: (payload: DomainEventMap['wishlist.items_removed']): Promise<void> =>
        notificationsService.create(removedFor('shop-tasks.wishlist-item-removed', payload)),

    /** A product the user asked about can be ordered again. */
    onStockAlertSent: ({
        userId,
        productId,
        titles
    }: DomainEventMap['stock_alert.sent']): Promise<void> =>
        notificationsService.create([
            {
                userId: new Types.ObjectId(userId),
                code: 'shop-tasks.stock-alert',
                severity: 'info',
                params: { productId, titles }
            }
        ]),

    /** A guest-cart merge could not add some lines at all: one message listing all of them. */
    onCartMergeRefused: ({ userId, lines }: DomainEventMap['cart.merge_refused']): Promise<void> =>
        notificationsService.create([
            {
                userId: new Types.ObjectId(userId),
                code: 'shop-tasks.cart-merge-refused',
                severity: 'warning',
                params: { lines }
            }
        ]),

    /**
     * A hold gave the buyer something to do or read: the same message in their inbox, so it is
     * still there when the email is not. Staff's reason never gets here, only the notice. An erased
     * account has no inbox to write to.
     */
    onFulfillmentOrderHoldNoticed: (
        held: DomainEventMap['fulfillment_order.hold_noticed']
    ): Promise<void> =>
        held.userId === undefined
            ? Promise.resolve()
            : notificationsService.create([
                  {
                      userId: new Types.ObjectId(held.userId),
                      code: 'shop-tasks.fulfillment-held',
                      severity: 'warning',
                      params: {
                          orderId: held.orderId,
                          fulfillmentOrderId: held.fulfillmentOrderId,
                          notice: held.notice,
                          ...(held.message ? { message: held.message } : {})
                      }
                  }
              ]),

    /**
     * A parcel of the buyer's was reported lost or damaged: the same message in their inbox, so it
     * is still there when the email is not. Carries the sentence staff wrote for them and what is
     * still owed, never staff's note. An erased account has no inbox to write to.
     */
    onShipmentLost: (lost: DomainEventMap['shipment.lost']): Promise<void> =>
        lost.userId === undefined
            ? Promise.resolve()
            : notificationsService.create([
                  {
                      userId: new Types.ObjectId(lost.userId),
                      code: 'shop-tasks.shipment-lost',
                      severity: 'warning',
                      params: {
                          orderId: lost.orderId,
                          shipmentId: lost.shipmentId,
                          reason: lost.reason,
                          ...(lost.message ? { message: lost.message } : {}),
                          ...(lost.owed.length > 0
                              ? { owed: lost.owed.map(({ title }) => title) }
                              : {}),
                          ...(lost.expectedAt ? { expectedAt: lost.expectedAt } : {})
                      }
                  }
              ]),

    /**
     * The notice half of `fulfillment_order.delayed`: a waiting preorder's buyer was told its date
     * moved or will be missed, and has the same message in their inbox. It only informs: the buyer
     * is asked nothing. An erased account has no inbox to write to, and nothing here invents one.
     */
    onFulfillmentOrderDelayedNotice: (
        delayed: DomainEventMap['fulfillment_order.delayed']
    ): Promise<void> =>
        delayed.userId === undefined
            ? Promise.resolve()
            : notificationsService.create([
                  {
                      userId: new Types.ObjectId(delayed.userId),
                      code: 'shop-tasks.fulfillment-delayed',
                      severity: 'warning',
                      params: {
                          orderId: delayed.orderId,
                          fulfillmentOrderId: delayed.fulfillmentOrderId,
                          titles: delayed.titles,
                          agreedAt: delayed.agreedAt,
                          ...(delayed.expectedAt ? { expectedAt: delayed.expectedAt } : {})
                      }
                  }
              ]),

    /** A buyer's checkout was paused: the staff who can ban hear of it, once per hold taken. */
    onPurchaseHoldPlaced: ({
        tenantId,
        userId,
        until
    }: DomainEventMap['order.purchase_hold_placed']): Promise<void> =>
        notificationsService
            .notifyStaff({
                tenantId,
                body: { code: 'shop-tasks.staff.purchase-hold-placed', params: { userId, until } },
                route: SHOP_STAFF_ROUTES['shop-tasks.staff.purchase-hold-placed'],
                link: {
                    template: FRONTEND_LINK_RULES.staffPages.user,
                    parameters: { id: userId }
                },
                dedupeKey: `purchase-hold-placed:${userId}:${until}`
            })
            .then(() => undefined),

    /**
     * A buyer asked to return goods: the staff who decide returns hear of it, once per request. A
     * withdrawal is a right, not a request awaiting a decision (it is born approved), so it is not
     * announced here: the digest counts it while its goods are expected.
     */
    onReturnRequested: ({
        returnId,
        orderId,
        reason
    }: DomainEventMap['return.requested']): Promise<void> =>
        reason === 'withdrawal'
            ? Promise.resolve()
            : notificationsService
                  .notifyStaff({
                      tenantId: DEPLOYMENT_TENANT_ID,
                      body: {
                          code: 'shop-tasks.staff.return-requested',
                          params: { returnId, orderId }
                      },
                      route: SHOP_STAFF_ROUTES['shop-tasks.staff.return-requested'],
                      dedupeKey: `return-requested:${returnId}`
                  })
                  .then(() => undefined)
};
