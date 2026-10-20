/**
 * @module
 * Starting fulfilment on a paid order, and the shipping-methods catalogue. Neither is about a
 * fulfillment order or a shipment, so neither belongs in an act.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { ORDER_EVENTS, orderService } from '@modules/orders';
import type {
    AuthContext,
    CallerContext,
    Order,
    OrderStatus,
    ShippingMethodsResponse
} from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { deliveryAuditActions } from '../audit';
import { SHIPPING_METHODS } from '../domain';
import { ensureFulfillmentOrders } from './ensure';
import { shopCurrency } from '@modules/shop';

/**
 * The full methods list, for the checkout page's selector. Static, so always a success.
 * Unfiltered — `cart`'s `PUT /cart/shipping-method` and checkout are what check a method against
 * the caller's real basket, server-side.
 *
 * `currency` is read fresh per call, not baked into `SHIPPING_METHODS` itself — it is live
 * deployment config (`NODE_DEFAULT_CURRENCY`), and a static array would freeze whichever value
 * happened to be set at import time.
 */
export const listMethods = (): ResponseSuccess<ShippingMethodsResponse> => {
    const currency = shopCurrency();
    return generateSuccess({
        // Spread: `SHIPPING_METHODS` itself is `readonly`, and the response type isn't.
        methods: SHIPPING_METHODS.map((method) => ({ ...method, currency }))
    });
};

/** The refusal {@link startFulfilment} answers when the order is not `paid`. */
const notPaid = (): ResponseReject =>
    generateReject(409, [{ code: ERROR_CODES.ORDER_NOT_PAID, message: t('delivery.not-paid') }]);

/** The statuses the order lifecycle lets fulfilment start from, widened so `includes` accepts any status. */
const STARTABLE_FROM: readonly OrderStatus[] = ORDER_EVENTS.start.from;

/**
 * Report that fulfilment has started on a paid order — the `paid → processing` door, before any
 * shipment exists to record. Makes the order's fulfillment orders too if the `paid` listener has not
 * yet. No `forced` variant: the admin override (`override:Order`,
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

        if (!STARTABLE_FROM.includes(order.status)) return notPaid();

        // The caller's id lands on the timeline row, so it names the operator and not the system.
        return ensureFulfillmentOrders(orderId)
            .then(() => orderService.markProcessing(orderId, undefined, context.caller.id))
            .then((moved) => {
                if (!moved) return notPaid();

                recordAudit(context, {
                    action: deliveryAuditActions.ADMIN_ORDER_FULFILMENT_STARTED,
                    outcome: 'success',
                    targetType: 'order',
                    targetId: orderId
                });
                return orderService.withActions(moved, authContext).then(generateSuccess);
            });
    });
