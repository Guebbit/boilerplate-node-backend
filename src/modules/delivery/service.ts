/**
 * @module
 * Delivery — shipments and the fake courier, downstream of the order's status machine. The
 * module never moves an order to `shipped` itself: it answers `ORDER_STATUS_CHANGED`, creating
 * the parcel, minting the tracking code, and sending the email. The reverse move (`shipped →
 * delivered`) is the fake courier, a job function behind an admin endpoint since this repo has
 * no scheduler. See: docs/modules/delivery.md
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
import type { ShippingMethodsResponse, Shipment, Caller } from '@types';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { deliveryAuditActions } from './audit';
import { orderService, orderRepository, ORDER_STATUS_CHANGED } from '@modules/orders';
import { userRepository } from '@modules/users';
import { SHIPPING_METHODS } from './domain';
import { shipmentShippedEmail } from './emails';
import { shipmentRepository } from './repository';
import type { ShipmentDocument } from './model';

/**
 * The tracking code an order's parcel travels under. Deterministic from the order id — the fake
 * courier has no counter to collide, and re-shipping the same order re-mints the same code,
 * which is exactly what the upsert wants.
 */
const trackingCodeFor = (orderId: string): string => `TRK-${orderId.slice(-8).toUpperCase()}`;

/** The methods list, for the checkout page's selector. Static, so always a success. */
const listMethods = (): ResponseSuccess<ShippingMethodsResponse> =>
    // `SHIPPING_METHODS` is `readonly` (frozen table); the response owns a fresh, mutable copy.
    generateSuccess({ methods: [...SHIPPING_METHODS] });

/** The shipment as `openapi.yaml` declares it: `Shipment`, built rather than serialized. */
const toShipmentResponse = (shipment: ShipmentDocument): Shipment => ({
    id: String(shipment._id),
    orderId: String(shipment.orderId),
    trackingCode: shipment.trackingCode,
    status: shipment.status,
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
    authContext?: Caller
): Promise<ResponseSuccess<Shipment> | ResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);
        return shipmentRepository.findByOrderId(orderId).then((shipment) => {
            if (!shipment) return generateReject(404, [t('delivery.not-shipped')]);
            return generateSuccess(toShipmentResponse(shipment));
        });
    });

/**
 * `ORDER_STATUS_CHANGED`'s listener: creates the parcel once, idempotently — the upsert re-finds
 * an existing shipment, so an admin toggling status cannot spam the customer with re-sends.
 * Locale comes from the user record if one exists; the email address is always the order's.
 * @param orderId - the order that moved
 */
export const shipOrder = async (orderId: string): Promise<void> => {
    const order = await orderRepository.findById(orderId);
    if (!order) return;

    const existing = await shipmentRepository.findByOrderId(orderId);
    const shipment = await shipmentRepository.upsertForOrder(orderId, trackingCodeFor(orderId));
    if (existing) return;

    // `order.userId` is absent once a detach has erased the account — nothing to
    // look up, same as the pre-existing "id points at nobody" case just below.
    const user = order.userId
        ? await userRepository.findById(String(order.userId)).catch(() => null)
        : null;
    const mail = shipmentShippedEmail(
        user?.locale ?? getDefaultLocale(),
        user?.username ?? order.email,
        shipment.trackingCode
    );
    void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    logger.info(`Order ${orderId} shipped as ${shipment.trackingCode}`);
};

/**
 * The fake courier's tick: every parcel on a truck arrives. A job function, not a schedule (see
 * module docblock). Per parcel, the ORDER moves first through the conditional `shipped →
 * delivered`, resolving a racing admin write to one winner; only a moved order's shipment is then
 * stamped, so the parcel record can lag the order for a beat but never contradict it. The log
 * line is the contract, same as the token cleanup's.
 * @returns how many parcels arrived
 */
export const runCourierAdvance = async (context: CallerContext): Promise<number> => {
    const shipments = await shipmentRepository.findAllShipped();
    let advanced = 0;

    for (const shipment of shipments) {
        const order = await orderRepository.updateStatusIfIn(
            String(shipment.orderId),
            ['shipped'],
            'delivered',
            {}
        );
        if (!order) continue;

        /*
         * Conditional for the same race-safety reason as the order move above: `findAllShipped`
         * read this document earlier, and a second tick may be updating it right now, so an
         * unconditional write could stamp `deliveredAt` twice and record the wrong finish time.
         * The result is not checked — the count already comes from the ORDER's conditional move
         * above; `null` here just means another tick already stamped this delivery, not a failure.
         */
        await shipmentRepository.updateStatusIfIn(
            String(shipment.orderId),
            ['shipped'],
            'delivered',
            {
                deliveredAt: new Date()
            }
        );
        advanced += 1;

        await emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId: String(shipment.orderId),
            from: 'shipped',
            to: 'delivered'
        });
    }

    logger.info(`Courier advance: ${advanced} of ${shipments.length} parcels delivered`);

    emitAuditEvent(
        buildAuditEvent(context, {
            action: deliveryAuditActions.ADMIN_COURIER_ADVANCED,
            outcome: 'success',
            metadata: { advanced }
        })
    );

    return advanced;
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

/**
 * The module's one service handle. `shipOrder` sits on it like the rest — called through this
 * module's own subscription, not from outside — so no member is left off for a caller to learn
 * to import differently.
 */
export const deliveryService = {
    listMethods,
    getForOrder,
    shipOrder,
    runCourierAdvance
};
