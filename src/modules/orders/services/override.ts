/**
 * @module
 * The admin override — the one door that may skip a `from` gate `domain/lifecycle.ts`'s
 * `ORDER_LIFECYCLE` would otherwise refuse, or correct a status with no parcel/email consequence
 * at all. Two shapes, one write path: {@link overrideStatus} is the status-only door
 * (`POST /orders/{id}/status-override`), {@link forceMove} is what `delivery`'s ship/deliver doors
 * call when their own caller carries `forced: true` — both funnel through {@link applyOverride}, so
 * the history entry and the audit event can never drift between the two.
 *
 * `orders` stays the only status writer even here: `delivery` never touches `order.status`
 * itself, it asks `forceMove` to, the same shape it already asks `markShipped`/`markDelivered`.
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
import { emitDomainEvent } from '@kernel/events';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import type { OrderDocument, OrderStatusOverride } from '../model';
import { orderRepository } from '../repository';
import { ORDER_STATUS_CHANGED } from '../events';
import { ordersAuditActions } from '../audit';
import { canOverrideTo, statusesOverridableInto } from '../domain';

/**
 * Write one override, whichever door asked for it — the conditional write, the history entry, the
 * event and the audit trail all happen once, here, so neither caller below can produce a status
 * move with no matching history row or vice versa.
 * @param orderId - the order to move
 * @param observedFrom - the status a fresh read found the order at, immediately before this call —
 *   recorded on the history entry as-is; the conditional write below still guards against every
 *   legal `from`, not only this one, so a benign race (the order moved between that read and this
 *   write, but stayed within the allowed set) still lands, just possibly against a `from` one step
 *   more recent than what the history entry claims — no admin action here is hot-path enough to pay
 *   for a strict read-your-write transaction over that edge case
 * @param to - the status being written; caller has already confirmed `canOverrideTo(observedFrom, to)`
 * @param mode - `'status'` for the status-only door, `'forced'` for a delivery door
 * @param reason - required on every override, never empty
 * @param context - the admin making the call
 * @returns the order as it now stands, or `null` if it had already moved past every legal `from`
 */
const applyOverride = (
    orderId: string,
    observedFrom: OrderStatus,
    to: OrderStatus,
    mode: OrderStatusOverride['mode'],
    reason: string,
    context: CallerContext
): Promise<OrderDocument | null> => {
    // `caller.id` is optional on the type only because a stranger genuinely has none — this
    // function is never reached without `orders.any.override`, which no stranger holds.
    const actorUserId = context.caller.id;
    if (!actorUserId) return Promise.resolve(null);

    const allowedFrom = statusesOverridableInto(to);
    const entry: OrderStatusOverride = {
        from: observedFrom,
        to,
        mode,
        reason,
        actorUserId,
        at: new Date()
    };

    return orderRepository.applyStatusOverride(orderId, allowedFrom, to, entry).then((updated) => {
        if (!updated) return null;

        void emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId,
            from: observedFrom,
            to,
            ...(mode === 'status' ? { override: true as const } : {})
        });

        emitAuditEvent(
            buildAuditEvent(context, {
                action: ordersAuditActions.ORDER_STATUS_OVERRIDDEN,
                outcome: 'success',
                target_type: 'order',
                target_id: orderId,
                metadata: { mode, from: observedFrom, to, reason }
            })
        );

        return updated;
    });
};

/**
 * `POST /orders/{id}/status-override` — an override holder moves an order forward with no parcel
 * and no shipped email, for the cases those consequences would be wrong (a manual correction, a
 * parcel that was never going to be tracked through the normal doors). Webhooks still fire — a
 * subscriber cares the status moved, not by which door.
 * @param orderId - the order to move
 * @param to - the status to move it to; refused unless `canOverrideTo` allows it from wherever the
 *   order actually stands
 * @param reason - required, never empty — the schema layer already refused an empty one
 * @param context - the override holder; the route's `requirePermission('orders.any.override')`
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

        if (!canOverrideTo(order.status, to))
            return generateReject(409, [
                {
                    code: 'ORDER_OVERRIDE_NOT_ALLOWED',
                    message: t('orders.override.not-allowed'),
                    details: { from: order.status, to }
                }
            ]);

        return applyOverride(orderId, order.status, to, 'status', reason, context).then(
            (updated) => {
                if (!updated)
                    // Lost a race against another write since the read above — same shape as the
                    // ordinary `update`'s 409, not a 404: the order still exists.
                    return generateReject(409, [
                        {
                            code: 'ORDER_OVERRIDE_NOT_ALLOWED',
                            message: t('orders.override.not-allowed'),
                            details: { from: order.status, to }
                        }
                    ]);
                return generateSuccess(updated);
            }
        );
    });

/**
 * What `delivery`'s ship/deliver doors call when their own caller passed `forced: true` — they
 * have already confirmed the caller holds `orders.any.override` and that `reason` is non-empty;
 * this only enforces that `to` is itself a legal override destination from wherever the order
 * happens to stand right now; `delivery` still writes the parcel record around this call.
 * @param orderId - the order to move
 * @param to - `shipped` or `delivered` — `delivery`'s two doors are the only callers
 * @param reason - required, already validated non-empty by the caller
 * @param context - the override holder
 * @returns the order as it now stands, or `null` if the move was no longer legal (lost a race, or
 *   the order had already moved past `to`)
 */
export const forceMove = (
    orderId: string,
    to: Extract<OrderStatus, 'shipped' | 'delivered'>,
    reason: string,
    context: CallerContext
): Promise<OrderDocument | null> =>
    orderRepository.findByIdScoped(orderId).then((order) => {
        if (!order || !canOverrideTo(order.status, to)) return null;
        return applyOverride(orderId, order.status, to, 'forced', reason, context);
    });
