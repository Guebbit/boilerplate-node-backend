/**
 * @module
 * Delivery — shipments, one order at a time. Staff records a parcel's handover through
 * {@link recordShipment} and its arrival through {@link recordDelivery}; each writes the parcel
 * FIRST, then reports the fact to `orders` — `orders` is the only status writer, this module only
 * ever asks it to move. {@link fulfillOrder} is the digital-only alternative to both: nothing here
 * ever rides in a parcel, so there is no parcel to write at all. See: docs/modules/delivery.md
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { ShippingMethodsResponse, Shipment, Order, AuthContext } from '@types';
import { OrderStatus } from '@types';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { deliveryAuditActions } from './audit';
import {
    orderService,
    canTransition,
    canOverrideTo,
    mailBuyer,
    isForceMoveRefusal,
    isDigitalOnlyOrder,
    shopCurrency,
    shipToCountries
} from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { holdsKey } from '@kernel/ability';
import { findShippingMethod, SHIPPING_METHODS } from './domain';
import { shipmentShippedEmail } from './emails';
import { shipmentRepository } from './repository';
import type { ShipmentDocument } from './model';
import { presentShipment } from './presenter';
import { ERROR_CODES } from '@api/error-codes';

/**
 * The full methods list, for the checkout page's selector. Static, so always a success.
 * Unfiltered — `cart`'s `PUT /cart/shipping-method` and checkout are what check a method against
 * the caller's real basket, server-side.
 *
 * `currency` and `shipToCountries` are read fresh per call, not baked into `SHIPPING_METHODS`
 * itself — both are live deployment config (`NODE_DEFAULT_CURRENCY`/`NODE_SHIP_TO_COUNTRIES`),
 * and a static array would freeze whichever value happened to be set at import time.
 */
const listMethods = (): ResponseSuccess<ShippingMethodsResponse> => {
    const currency = shopCurrency();
    return generateSuccess({
        // Spread: `SHIPPING_METHODS` itself is `readonly`, and the response type isn't.
        methods: SHIPPING_METHODS.map((method) => ({ ...method, currency })),
        shipToCountries: shipToCountries()
    });
};

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
            return generateSuccess(presentShipment(shipment));
        });
    });

/** The refusal {@link startFulfilment} answers when the order is not `paid`. */
const notPaid = (): ResponseReject =>
    generateReject(409, [{ code: ERROR_CODES.ORDER_NOT_PAID, message: t('delivery.not-paid') }]);

/**
 * Report that fulfilment has started on a paid order — the `paid → processing` door, before any
 * parcel exists to record. No `forced` variant: the admin override (`orders.any.override`,
 * `POST /orders/{id}/status-override`) is the other reachable path onto `processing`, and adding
 * a second forcing shape here would only duplicate it.
 * @param orderId - the order to start fulfilling
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry — a narrower, already-resolved shape than
 *   `authContext`, which is why both travel here rather than one being derived from the other
 */
export const startFulfilment = (
    orderId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Order> | ResponseReject> =>
    orderService.getById(orderId).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);
        if (!canTransition(order.status, OrderStatus.processing, 'system')) return notPaid();

        return orderService.markProcessing(orderId).then((moved) => {
            if (!moved) return notPaid();

            auditOrderEvent(context, orderId, deliveryAuditActions.ADMIN_ORDER_FULFILMENT_STARTED);
            return orderService.withActions(moved, authContext).then(generateSuccess);
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
            { code: ERROR_CODES.FORBIDDEN, message: t('generic.error-forbidden') }
        ]);
    if (!reason)
        return generateReject(422, [
            {
                code: ERROR_CODES.DELIVERY_OVERRIDE_REASON_REQUIRED,
                message: t('delivery.override-reason-required')
            }
        ]);
    return undefined;
};

/**
 * The shipped-parcel notification: the carrier email, addressed in the buyer's own language when
 * an account is still attached, and the operator-facing log line — {@link recordShipment}'s own
 * notification step, named so the chain around it reads as steps rather than nested callbacks.
 * `order.userId` is absent once a detach has erased the account, and a lookup that fails for any
 * other reason is `mailBuyer`'s own policy to log and fall back on — see `@modules/orders`.
 */
const notifyShipped = (
    orderId: string,
    order: OrderDocument,
    shipment: ShipmentDocument
): Promise<void> =>
    mailBuyer(order, (locale, name) => {
        const mail = shipmentShippedEmail(locale, name, shipment.trackingCode);
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
        // Stryker disable next-line all
        logger.info(`Order ${orderId} shipped as ${shipment.trackingCode ?? '(untracked)'}`);
    });

/**
 * The order-related audit entry every admin action in this module writes: one line, on success,
 * naming the order as the target. Shared so {@link afterShipmentRecorded} and
 * {@link moveAndStampDelivered} differ only in which action fired, never in the entry's shape.
 * @param context - the caller
 * @param orderId - the order the action targets
 * @param action - which of this module's two audit actions fired
 */
const auditOrderEvent = (
    context: CallerContext,
    orderId: string,
    action: (typeof deliveryAuditActions)[keyof typeof deliveryAuditActions]
): void =>
    recordAudit(context, {
        action,
        outcome: 'success',
        target_type: 'order',
        target_id: orderId
    });

/** The refusal shared by both {@link recordShipment} gates: forced or not, this order isn't `processing`. */
const notProcessing = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.ORDER_NOT_PROCESSING, message: t('delivery.not-processing') }
    ]);

/** {@link recordShipment}'s refusal for a digital-only order — {@link fulfillOrder} is its door instead. */
const nothingToShip = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.ORDER_NOTHING_TO_SHIP, message: t('delivery.nothing-to-ship') }
    ]);

/** {@link fulfillOrder}'s refusal for an order that still has a physical line — `ship` is its door instead. */
const notDigitalOnly = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.ORDER_NOT_DIGITAL_ONLY, message: t('delivery.not-digital-only') }
    ]);

/**
 * Mark a digital-only order fulfilled — the `processing → delivered` door for an order with
 * nothing to physically hand over, an alternative to {@link recordShipment}/{@link recordDelivery}
 * rather than a variant of either: no parcel record exists before this call, and none is written
 * by it. Refuses an order that still carries a physical line with the same 409 shape
 * `recordShipment` refuses a digital-only order with, so a client reads either failure as "wrong
 * door" rather than two different problems.
 * @param orderId - the digital-only order to mark fulfilled
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 */
export const fulfillOrder = (
    orderId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<Order> | ResponseReject> =>
    orderService.getById(orderId).then((order) => {
        if (!order) return generateReject(404, [t('delivery.order-not-found')]);
        if (order.status !== OrderStatus.processing) return notProcessing();
        if (!isDigitalOnlyOrder(order.items)) return notDigitalOnly();

        return orderService.markFulfilled(orderId).then((moved) => {
            if (!moved) return notProcessing();

            auditOrderEvent(context, orderId, deliveryAuditActions.ADMIN_ORDER_FULFILLED);
            return orderService.withActions(moved, authContext).then(generateSuccess);
        });
    });

/**
 * Everything a successful parcel write unlocks: move the order to `shipped` — forced past the
 * normal gate when `forced` says so — then, only once that move is confirmed, mail the carrier
 * notification and record the admin action. The move is checked first because the parcel write is
 * idempotent (unique on `orderId`) while this order move is the actually at-most-once step; a
 * racing loser must not notify or audit a shipment the order itself never reached.
 * @param orderId - the order being shipped
 * @param order - the order read at the top of {@link recordShipment}, for the notification's own use
 * @param shipment - the parcel just upserted
 * @param context - the caller, for the audit entry
 * @param forced - skip the normal `processing`-only gate; requires `orders.any.override` + `reason`
 * @param reason - required exactly when `forced` is `true`, recorded on the order's override history
 */
const afterShipmentRecorded = (
    orderId: string,
    order: OrderDocument,
    shipment: ShipmentDocument,
    context: CallerContext,
    forced: boolean | undefined,
    reason: string | undefined
): Promise<ResponseSuccess<Shipment> | ResponseReject> => {
    const moveOrder = forced
        ? orderService.forceMove(orderId, OrderStatus.shipped, reason!, context)
        : orderService.markShipped(orderId);

    return moveOrder.then((moved) => {
        // Checked FIRST: a refusal object is truthy, so `!moved` alone would treat it as a move.
        if (isForceMoveRefusal(moved)) return moved;
        if (!moved) return notProcessing();

        return notifyShipped(orderId, order, shipment).then(() => {
            auditOrderEvent(context, orderId, deliveryAuditActions.ADMIN_ORDER_SHIPPED);
            return generateSuccess(presentShipment(shipment));
        });
    });
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
        if (!eligible) return notProcessing();
        // Digital-only refuses outright, forced included: there is genuinely nothing to hand a
        // carrier, so recording one here would just be `fulfillOrder`'s job done through the
        // wrong door with a fake parcel behind it.
        if (isDigitalOnlyOrder(order.items)) return nothingToShip();

        const method = order.shippingMethod ? findShippingMethod(order.shippingMethod) : undefined;
        if (method?.tracked && !trackingCode)
            return generateReject(422, [
                {
                    code: ERROR_CODES.DELIVERY_TRACKING_CODE_REQUIRED,
                    message: t('delivery.tracking-code-required')
                }
            ]);

        return shipmentRepository
            .upsertForOrder(orderId, trackingCode)
            .then((shipment) =>
                afterShipmentRecorded(orderId, order, shipment, context, forced, reason)
            );
    });
};

/** The refusal every {@link recordDelivery} gate answers alike — one shape, one place. */
const notShipped = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.ORDER_NOT_SHIPPED, message: t('delivery.not-shippable-for-delivery') }
    ]);

/**
 * The write half of {@link recordDelivery}, run only once a live `shipped` parcel is confirmed to
 * exist. The order moves FIRST, the shipment is stamped second — a parcel record is evidence the
 * order arrived, not the other way round. Stamping the shipment first and only then asking
 * `orders` to move would let a refused order move leave a `delivered` parcel paired with an order
 * stuck at `shipped`, which nothing — forced included, since the caller already confirmed the
 * shipment — could ever move forward again. This order leaves BOTH sides exactly where they stood
 * on a failed order move; the caller's own upfront read is what keeps this narrowed to a genuine
 * concurrent race rather than the common case (no shipment at all) that must never reach here.
 */
const moveAndStampDelivered = (
    orderId: string,
    context: CallerContext,
    forced: boolean | undefined,
    reason: string | undefined
): Promise<ResponseSuccess<Shipment> | ResponseReject> => {
    const moveOrder = forced
        ? orderService.forceMove(orderId, OrderStatus.delivered, reason!, context)
        : orderService.markDelivered(orderId);

    return moveOrder.then((moved) => {
        // Checked FIRST: a refusal object is truthy, so `!moved` alone would treat it as a move.
        if (isForceMoveRefusal(moved)) return moved;
        if (!moved) return notShipped();

        return shipmentRepository
            .updateStatusIfIn(orderId, ['shipped'], 'delivered', { deliveredAt: new Date() })
            .then((updated) => {
                if (!updated) return notShipped();

                auditOrderEvent(context, orderId, deliveryAuditActions.ADMIN_ORDER_DELIVERED);
                return generateSuccess(presentShipment(updated));
            });
    });
};

/**
 * Record a parcel's arrival — the delivery door. Confirms the shipment is actually `shipped`
 * FIRST — a READ, nothing written yet — then asks `orders` to move, then stamps the shipment
 * `delivered`. `forced` only widens which ORDER statuses are eligible; it never means the
 * shipment doesn't have to exist. Without the upfront read, a forced delivery of an order with no
 * parcel on file could move the order to `delivered` and only THEN discover there was nothing to
 * stamp — a 409 that lies about what already happened, since the order move is not rolled back.
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
        if (!eligible) return notShipped();

        return shipmentRepository.findByOrderId(orderId).then((shipment) => {
            if (shipment?.status !== 'shipped') return notShipped();

            return moveAndStampDelivered(orderId, context, forced, reason);
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
    startFulfilment,
    recordShipment,
    recordDelivery,
    fulfillOrder
};
