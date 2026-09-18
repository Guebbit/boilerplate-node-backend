/**
 * @module
 * Delivery — shipments, one order at a time. Staff records a parcel's handover through
 * {@link recordShipment} and its arrival through {@link recordDelivery}; each writes the parcel
 * FIRST, then reports the fact to `orders` — `orders` is the only status writer, this module only
 * ever asks it to move. See: docs/modules/delivery.md
 */

import { t, getDefaultLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { ShippingMethodsResponse, Shipment, AuthContext } from '@types';
import { OrderStatus } from '@types';
import type { CallerContext } from '@types';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { deliveryAuditActions } from './audit';
import { orderService, canTransition, canOverrideTo } from '@modules/orders';
import { userService } from '@modules/users';
import { holdsKey } from '@kernel/ability';
import { SHIPPING_METHODS, findShippingMethod } from './domain';
import { shipmentShippedEmail } from './emails';
import { shipmentRepository } from './repository';
import type { ShipmentDocument } from './model';

/** The methods list, for the checkout page's selector. Static, so always a success. */
const listMethods = (): ResponseSuccess<ShippingMethodsResponse> =>
    // `SHIPPING_METHODS` is `readonly` (frozen table); the response owns a fresh, mutable copy.
    generateSuccess({ methods: [...SHIPPING_METHODS] });

/** The shipment as `openapi.yaml` declares it: `Shipment`, built rather than serialized. */
const toShipmentResponse = (shipment: ShipmentDocument): Shipment => ({
    id: String(shipment._id),
    orderId: String(shipment.orderId),
    status: shipment.status,
    ...(shipment.trackingCode ? { trackingCode: shipment.trackingCode } : {}),
    ...(shipment.deliveredAt ? { deliveredAt: shipment.deliveredAt.toISOString() } : {}),
    ...(shipment.createdAt ? { createdAt: shipment.createdAt.toISOString() } : {}),
    ...(shipment.updatedAt ? { updatedAt: shipment.updatedAt.toISOString() } : {})
});

/**
 * The shipment behind one of the caller's orders. Ownership is the order's, scoped like every
 * order read; a shipment has no owner of its own.
 * @param orderId - the order
 * @param authContext - the caller; sees only their own, admins see anyone's
 */
export const getForOrder = (
    orderId: string,
    authContext?: AuthContext
): Promise<ResponseSuccess<Shipment> | ResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);
        return shipmentRepository.findByOrderId(orderId).then((shipment) => {
            if (!shipment) return generateReject(404, [t('delivery.not-shipped')]);
            return generateSuccess(toShipmentResponse(shipment));
        });
    });

/**
 * A `forced: true` caller must hold `orders.any.override` (the route's own `delivery.any.update`
 * gate is not enough — forcing is a second, stricter permission) and must give a `reason`. Shared
 * between {@link recordShipment} and {@link recordDelivery} so the two doors cannot drift on what
 * "forced" requires.
 * @param context - the caller
 * @param forced - the request body's own flag
 * @param reason - the request body's own reason, required exactly when `forced` is `true`
 * @returns a 403/422 reject if forcing was asked for but not earned, `undefined` otherwise
 */
const refuseUnearnedForce = (
    context: CallerContext,
    forced: boolean | undefined,
    reason: string | undefined
): ResponseReject | undefined => {
    if (!forced) return undefined;
    if (!holdsKey(context.caller, 'orders.any.override'))
        return generateReject(403, [
            { code: 'FORBIDDEN', message: t('generic.error-forbidden') }
        ]);
    if (!reason)
        return generateReject(422, [
            { code: 'DELIVERY_OVERRIDE_REASON_REQUIRED', message: t('delivery.override-reason-required') }
        ]);
    return undefined;
};

/**
 * Record a parcel's handover to the carrier — the shipping door. Writes the parcel FIRST, then
 * asks `orders` to move: an order that cannot legally reach `shipped` refuses before anything is
 * written, so a stray call never creates a parcel for an order that cannot ship. `forced` widens
 * WHICH orders are eligible (an override holder's call, `canOverrideTo`) — it never widens what
 * gets written: the parcel and the tracking-code rule are identical either way.
 * @param orderId - the order to ship
 * @param trackingCode - the carrier's handle; required when the method is `tracked`
 * @param context - the caller, for the audit entry
 * @param forced - skip the normal `processing`-only gate; requires `orders.any.override` + `reason`
 * @param reason - required exactly when `forced` is `true`, recorded on the order's override history
 */
export const recordShipment = (
    orderId: string,
    trackingCode: string | undefined,
    context: CallerContext,
    forced?: boolean,
    reason?: string
): Promise<ResponseSuccess<Shipment> | ResponseReject> => {
    const unearned = refuseUnearnedForce(context, forced, reason);
    if (unearned) return Promise.resolve(unearned);

    return orderService.getById(orderId).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);
        // Asked of the order lifecycle rather than a status literal, same reasoning `orders`'
        // own `isPayable` callers follow: this module cannot drift off the rule's owner.
        const eligible = forced
            ? canOverrideTo(order.status, OrderStatus.shipped)
            : canTransition(order.status, OrderStatus.shipped, 'system');
        if (!eligible)
            return generateReject(409, [
                { code: 'ORDER_NOT_PROCESSING', message: t('delivery.not-processing') }
            ]);

        const method = order.shippingMethod ? findShippingMethod(order.shippingMethod) : undefined;
        if (method?.tracked && !trackingCode)
            return generateReject(422, [
                { code: 'DELIVERY_TRACKING_CODE_REQUIRED', message: t('delivery.tracking-code-required') }
            ]);

        return shipmentRepository.upsertForOrder(orderId, trackingCode).then((shipment) => {
            const moveOrder = forced
                ? orderService.forceMove(orderId, OrderStatus.shipped, reason!, context)
                : orderService.markShipped(orderId);

            return moveOrder.then((moved) => {
                // The parcel write above is idempotent (unique on orderId); this order's own
                // move is what is actually at-most-once — a racing loser lands here.
                if (!moved)
                    return generateReject(409, [
                        { code: 'ORDER_NOT_PROCESSING', message: t('delivery.not-processing') }
                    ]);

                // `order.userId` is absent once a detach has erased the account — nothing to
                // look up, the pre-existing "id points at nobody" case just below covers the rest.
                return (
                    order.userId
                        ? userService.getById(String(order.userId)).catch(() => null)
                        : Promise.resolve(null)
                ).then((user) => {
                    const mail = shipmentShippedEmail(
                        user?.locale ?? getDefaultLocale(),
                        user?.username ?? order.email,
                        shipment.trackingCode
                    );
                    void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
                    logger.info(`Order ${orderId} shipped as ${shipment.trackingCode ?? '(untracked)'}`);

                    emitAuditEvent(
                        buildAuditEvent(context, {
                            action: deliveryAuditActions.ADMIN_ORDER_SHIPPED,
                            outcome: 'success',
                            target_type: 'order',
                            target_id: orderId
                        })
                    );

                    return generateSuccess(toShipmentResponse(shipment));
                });
            });
        });
    });
};

/**
 * Record a parcel's arrival — the delivery door. Stamps the shipment FIRST, then asks `orders`
 * to move: an order that cannot legally reach `delivered` refuses before anything is written. The
 * shipment record itself must still be `shipped` regardless of `forced` — a parcel with no
 * recorded handover has nothing to stamp arrived, override or not; `forced` only widens which
 * ORDER statuses are eligible (an override holder's call — useful when the order's own status
 * field fell out of step with a shipment that genuinely did go out).
 * @param orderId - the order that arrived
 * @param context - the caller, for the audit entry
 * @param forced - skip the normal `shipped`-only order-status gate; requires `orders.any.override` + `reason`
 * @param reason - required exactly when `forced` is `true`, recorded on the order's override history
 */
export const recordDelivery = (
    orderId: string,
    context: CallerContext,
    forced?: boolean,
    reason?: string
): Promise<ResponseSuccess<Shipment> | ResponseReject> => {
    const unearned = refuseUnearnedForce(context, forced, reason);
    if (unearned) return Promise.resolve(unearned);

    return orderService.getById(orderId).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);
        const eligible = forced
            ? canOverrideTo(order.status, OrderStatus.delivered)
            : canTransition(order.status, OrderStatus.delivered, 'system');
        if (!eligible)
            return generateReject(409, [
                { code: 'ORDER_NOT_SHIPPED', message: t('delivery.not-shippable-for-delivery') }
            ]);

        return shipmentRepository
            .updateStatusIfIn(orderId, ['shipped'], 'delivered', { deliveredAt: new Date() })
            .then((shipment) => {
                if (!shipment)
                    return generateReject(409, [
                        { code: 'ORDER_NOT_SHIPPED', message: t('delivery.not-shippable-for-delivery') }
                    ]);

                const moveOrder = forced
                    ? orderService.forceMove(orderId, OrderStatus.delivered, reason!, context)
                    : orderService.markDelivered(orderId);

                return moveOrder.then((moved) => {
                    if (!moved)
                        return generateReject(409, [
                            { code: 'ORDER_NOT_SHIPPED', message: t('delivery.not-shippable-for-delivery') }
                        ]);

                    emitAuditEvent(
                        buildAuditEvent(context, {
                            action: deliveryAuditActions.ADMIN_ORDER_DELIVERED,
                            outcome: 'success',
                            target_type: 'order',
                            target_id: orderId
                        })
                    );

                    return generateSuccess(toShipmentResponse(shipment));
                });
            });
    });
};

/**
 * Every shipment behind a set of orders — for the account data export, called with the caller's
 * own order ids. Not on `deliveryService`: that handle is for this module's own subscription and
 * admin surface, and this is the one narrow read a sibling may make instead.
 *
 * @param orderIds - the caller's own order ids
 */
export const findShipmentsForOrders = (orderIds: string[]): Promise<ShipmentDocument[]> =>
    orderIds.length === 0 ? Promise.resolve([]) : shipmentRepository.findByOrderIds(orderIds);

/** The module's one service handle — every controller in this module goes through it. */
export const deliveryService = {
    listMethods,
    getForOrder,
    recordShipment,
    recordDelivery
};
