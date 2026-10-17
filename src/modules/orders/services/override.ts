/**
 * @module
 * The admin override — the one door that may correct a status with no shipped email and no
 * carrier record: {@link overrideStatus} (`POST /orders/{id}/status-override`). It writes the
 * status, the history entry, the stock leaving the shelf and the events in ONE transaction, and
 * announces `order.status_overridden` so `delivery` can bring its own records in step — `orders`
 * never touches a shipment itself.
 *
 * `orders` stays the only status writer even here: a forced shipment recorded through `delivery`
 * writes its own history row through `recordForcedFulfilment`, not through this door.
 *
 * See `docs/theory/tactical-ddd.md` §1 "Who writes the status".
 */

import { t } from '@infrastructure/i18n';
import { OrderStatus } from '@types';
import type { CallerContext } from '@types';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import type { ClientSession } from 'mongoose';
import { recordAudit } from '@infrastructure/observability/audit';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import { announceInTransaction } from '@kernel/outbox';
import { statusChangedEvent, statusOverriddenEvent } from './announce';
import { announceMoveShippingStock } from './ship-stock';
import { withTimeline } from './timeline';
import { ordersAuditActions } from '../audit';
import { canOverrideTo, isDigitalOnlyOrder, deliveryClockFor, shipsAwaitedStock } from '../domain';
import { withdrawalPeriodDays } from '../config';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Write one override — the conditional write, the timeline row, the stock leaving the shelf, the
 * events and the audit trail all happen once, here, so no status move can exist without its
 * history row or the reverse.
 * @param order - the order to move, as a fresh read found it immediately before this call; the
 *   write lands only while the order still stands at that status, so the timeline row, the audit
 *   metadata and the events never claim a `from` the order was not in
 * @param to - the status being written; caller has already confirmed `canOverrideTo(order.status, to)`
 * @param reason - required on every override, never empty
 * @param context - the admin making the call
 * @returns the order as it now stands, or `null` if it moved since the read
 */
const applyOverride = (
    order: OrderDocument,
    to: OrderStatus,
    reason: string,
    context: CallerContext
): Promise<OrderDocument | null> => {
    // `caller.id` is optional on the type only because a stranger genuinely has none — this
    // function is never reached without `override:Order`, which no stranger holds. Rejected,
    // not resolved to `null`: `null` here means "lost a race", which this is not, and
    // `overrideStatus` would otherwise report a genuinely missing actor as a 409 conflict rather
    // than the invariant violation it actually is.
    const actorUserId = context.caller.id;
    if (!actorUserId)
        return Promise.reject(
            new Error(
                '[orders] applyOverride reached with no caller id — override:Order should be unreachable for a stranger'
            )
        );

    const orderId = String(order._id);
    const observedFrom = order.status;
    const at = new Date();

    // An override into `delivered` never passes through `markDelivered`, so no delivery timestamp
    // exists: the deadline is counted from the override itself, which is when the shop says the
    // order arrived — or from payment, for digital content.
    const clock =
        to === OrderStatus.delivered
            ? deliveryClockFor(order, at, withdrawalPeriodDays())
            : undefined;

    // The row commits with the move: no override exists without its history, or the reverse.
    const write = withTimeline(
        (session: ClientSession) =>
            orderRepository.applyStatusOverride(orderId, observedFrom, to, clock, session),
        () => [
            {
                type: 'status_overridden',
                actor: actorUserId,
                text: reason,
                data: { mode: 'status', from: observedFrom, to },
                at
            }
        ]
    );

    const announce = () => [
        statusChangedEvent(orderId, observedFrom, to),
        statusOverriddenEvent(orderId, observedFrom, to, at)
    ];

    // Overriding past dispatch is still a dispatch: whatever has not shipped yet leaves the shelf
    // with the status. `processing` is not one; a hold already `shipped` makes the stock half a no-op.
    const move =
        to === OrderStatus.processing
            ? announceInTransaction(write, announce)
            : announceMoveShippingStock(orderId, write, announce);

    return move.then((updated) => {
        if (!updated) return null;

        recordAudit(context, {
            action: ordersAuditActions.ORDER_STATUS_OVERRIDDEN,
            outcome: 'success',
            targetType: 'order',
            targetId: orderId,
            metadata: { mode: 'status', from: observedFrom, to, reason }
        });

        return updated;
    });
};

/** The one 409 both refusal points in {@link overrideStatus} answer with — a status that is not a legal override target. */
const notAllowed = (from: OrderStatus, to: OrderStatus): ResponseReject =>
    generateReject(409, [
        {
            code: ERROR_CODES.ORDER_OVERRIDE_NOT_ALLOWED,
            message: t('orders.override.not-allowed'),
            details: { from, to }
        }
    ]);

/** The 409 for an override that would ship units still awaiting stock. */
const awaitingStock = (): ResponseReject =>
    generateReject(409, [
        {
            code: ERROR_CODES.ORDER_OVERRIDE_AWAITING_STOCK,
            message: t('orders.override.awaiting-stock')
        }
    ]);

/**
 * `POST /orders/{id}/status-override` — an override holder moves an order forward with no shipped
 * email, for the cases that consequence would be wrong (a manual correction, a parcel that was
 * never going to be tracked through the normal doors). `delivery` hears `order.status_overridden`
 * and keeps its own records in step. Webhooks still fire — a subscriber cares the status moved, not
 * by which door.
 * @param orderId - the order to move
 * @param to - the status to move it to; refused unless `canOverrideTo` allows it from wherever the
 *   order actually stands
 * @param reason - required, never empty — the schema layer already refused an empty one
 * @param context - the override holder; the route's `requirePermission('override', 'Order')`
 *   has already confirmed they hold the key
 */
export const overrideStatus = (
    orderId: string,
    to: OrderStatus,
    reason: string,
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository.findByIdScoped(orderId).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);

        if (!canOverrideTo(order.status, to, isDigitalOnlyOrder(order.items)))
            return notAllowed(order.status, to);
        if (shipsAwaitedStock(to, order.fulfillment)) return awaitingStock();

        return applyOverride(order, to, reason, context).then((updated) =>
            // Lost a race against another write since the read above — same shape as the
            // ordinary `update`'s 409, not a 404: the order still exists.
            updated ? generateSuccess(updated) : notAllowed(order.status, to)
        );
    });
