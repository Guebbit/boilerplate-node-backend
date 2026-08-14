/**
 * Delivery — shipments and the fake courier, downstream of the order's status machine.
 *
 * The module never moves an order to `shipped` itself: staff do that through the admin order
 * write, and this module ANSWERS the `ORDER_STATUS_CHANGED` announcement — creates the parcel,
 * mints its tracking code, sends the email. The other direction (`shipped → delivered`) is the
 * fake courier: a job function behind an admin endpoint, the same shape as the token cleanup,
 * because this repo deliberately has no scheduler — an operator (or a demo click) is the cron.
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
import { emitDomainEvent } from '@kernel/events';
import { orderService, orderRepository, ORDER_STATUS_CHANGED } from '@modules/orders';
import { userRepository } from '@modules/users';
import { SHIPPING_METHODS } from './domain';
import { shipmentShippedEmail } from './emails';
import { shipmentRepository } from './repository';
import type { ShipmentDocument } from './model';
import type { ShippingMethod } from './domain';

/**
 * The tracking code an order's parcel travels under. Deterministic from the order id — the fake
 * courier has no counter to collide, and re-shipping the same order re-mints the same code,
 * which is exactly what the upsert wants.
 */
const trackingCodeFor = (orderId: string): string => `TRK-${orderId.slice(-8).toUpperCase()}`;

/** The methods list, for the checkout page's selector. Static, so always a success. */
export const listMethods = (): ResponseSuccess<{ methods: readonly ShippingMethod[] }> =>
    generateSuccess({ methods: SHIPPING_METHODS });

/**
 * The shipment behind one of the caller's orders.
 *
 * Ownership is the ORDER's, read through the same scope every order read uses — a shipment has
 * no owner of its own, it belongs to whoever the parcel is going to.
 *
 * @param orderId - the order
 * @param authContext - the caller; sees only their own, admins see anyone's
 */
export const getForOrder = (
    orderId: string,
    authContext?: { id?: string; admin?: boolean }
): Promise<ResponseSuccess<ShipmentDocument> | ResponseReject> =>
    orderService.getById(orderId, orderService.callerScope(authContext)).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);
        return shipmentRepository.findByOrderId(orderId).then((shipment) => {
            if (!shipment) return generateReject(404, [t('delivery.not-shipped')]);
            return generateSuccess(shipment);
        });
    });

/**
 * `ORDER_STATUS_CHANGED`'s listener: an order reaching `shipped` gets its parcel.
 *
 * Idempotent end to end — the upsert re-finds the existing shipment, and the email only goes
 * out when the parcel is genuinely new, so an admin toggling a status cannot spam the customer.
 * The recipient's language comes from their user record when they still have one; the email
 * address is the ORDER's, which is authoritative for where this order talks.
 *
 * @param orderId - the order that moved
 */
export const shipOrder = async (orderId: string): Promise<void> => {
    const order = await orderRepository.findById(orderId);
    if (!order) return;

    const existing = await shipmentRepository.findByOrderId(orderId);
    const shipment = await shipmentRepository.upsertForOrder(orderId, trackingCodeFor(orderId));
    if (existing) return;

    const user = await userRepository.findById(String(order.userId)).catch(() => null);
    const mail = shipmentShippedEmail(
        user?.locale ?? getDefaultLocale(),
        user?.username ?? order.email,
        shipment.trackingCode
    );
    void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    logger.info(`Order ${orderId} shipped as ${shipment.trackingCode}`);
};

/**
 * The fake courier's tick: every parcel on a truck arrives.
 *
 * A job function, not a schedule — see the module docblock. Per parcel, the ORDER moves first
 * through the conditional `shipped → delivered` (the primitive that makes a racing admin write
 * resolve to one winner), and only a moved order's shipment is stamped: the parcel record can
 * lag the order for a beat, never contradict it. For an unattended job the log line is the
 * contract, same as the token cleanup's.
 *
 * @returns how many parcels arrived
 */
export const runCourierAdvance = async (): Promise<number> => {
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

        shipment.status = 'delivered';
        shipment.deliveredAt = new Date();
        await shipmentRepository.save(shipment);
        advanced += 1;

        await emitDomainEvent(ORDER_STATUS_CHANGED, {
            orderId: String(shipment.orderId),
            from: 'shipped',
            to: 'delivered'
        });
    }

    logger.info(`Courier advance: ${advanced} of ${shipments.length} parcels delivered`);
    return advanced;
};
