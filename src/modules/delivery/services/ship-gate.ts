/**
 * @module
 * The one order-state question the ship door, the fulfil door and their `actions` flags all ask:
 * may a shipment leave an order in this status? Kept apart from `ship.ts` and `fulfill.ts` (the
 * acts) and `actions.ts` (the flags) so none imports another. Also the shared "may this caller
 * make the `paid → processing` move" step, since both acts make it themselves.
 */

import { holds } from '@kernel/ability';
import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { canShip, canProcessOrder } from '@modules/orders';
import type { CallerContext, OrderStatus } from '@types';
import { ActRefusal } from './act';

/**
 * Whether a shipment (or a digital fulfilment) may leave an order in this status: `processing`, or
 * `paid` when the caller may also start fulfilment — the act then makes the `paid → processing`
 * move itself, so shipping from `paid` is an ordinary act and not an override.
 * @param status - the order's status
 * @param mayStart - whether the caller holds `start:Shipment`
 */
export const isOpenForShipment = (status: OrderStatus, mayStart: boolean): boolean =>
    canShip(status) || (mayStart && canProcessOrder(status));

/**
 * Whether the caller holds the key for the `paid → processing` move the ship and fulfil acts make
 * themselves. Read before the act's transaction opens, so a retried transaction cannot change it.
 * @param context - the caller
 */
export const mayStartFulfilment = (context: CallerContext): boolean =>
    holds(context.caller, 'start', 'Shipment');

/**
 * Refuse a `paid` order to a caller who may not start it: the act would make that move for them,
 * which `update:Shipment` alone does not cover. Any other status is left to the gate that follows.
 * @param status - the order's status
 * @param mayStart - whether the caller holds `start:Shipment`
 * @throws {ActRefusal} a 403 when the order is `paid` and the caller lacks `start:Shipment`
 */
export const refuseUnearnedStart = (status: OrderStatus, mayStart: boolean): void => {
    if (canProcessOrder(status) && !mayStart)
        throw new ActRefusal(generateReject(403, [t('generic.error-forbidden')]));
};

/**
 * Audit the 403 {@link refuseUnearnedStart} threw. Runs after the act, not inside it: a transaction
 * may retry, and the row must be written once. The act's only 403 is this one.
 * @param context - the caller
 * @param reject - what the act answered with
 * @param fulfillmentOrderId - the fulfillment order the caller tried to ship from
 */
export const auditUnearnedStart = (
    context: CallerContext,
    reject: ResponseReject,
    fulfillmentOrderId: string
): void => {
    if (reject.status !== 403) return;
    auditForbidden(context, {
        targetType: 'fulfillment_order',
        targetId: fulfillmentOrderId,
        metadata: { reason: 'missing_permission', permission: 'start:Shipment' }
    });
};
