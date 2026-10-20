/**
 * @module
 * Holding a fulfillment order back, and letting it go. A hold stops it shipping and says why
 * (Shopify's hold reasons). Staff's reasons are `incorrect_address`, `high_risk` and `other`;
 * `awaiting_stock` is set only by the allocation of stock and released only by it — a hand release
 * would ship goods the stock ledger never counted out, a consistency guard (CLAUDE.md § Scope), not a
 * policy about administrators.
 *
 * See: docs/modules/delivery.md#holds
 */

import type { ClientSession } from 'mongoose';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { isAwaitingGoods, orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext, CallerContext, FulfillmentHoldReason, FulfillmentOrder } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { isHoldable, isReleasable, statusOfLines } from '../domain';
import { deliveryAuditActions } from '../audit';
import { fulfillmentOrderRepository } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import { readWithOrder, refuse, runAct } from './act';
import { viewFulfillmentOrder } from './actions';
import { announceHeld, announceReleased } from './announce';
import { reportProgress } from './progress';

/** What staff sends to hold. */
export interface HoldInput {
    /** Why; never `awaiting_stock`. */
    reason: Exclude<FulfillmentHoldReason, 'awaiting_stock'>;
    /** Free text for the staff who read the hold later. */
    note?: string | undefined;
    /** A sentence for the buyer, mailed with the hold. */
    message?: string | undefined;
}

/** What a committed hold or release leaves for the steps that follow it. */
interface Changed {
    fulfillmentOrder: FulfillmentOrderDocument;
    order: OrderDocument;
    /** The hold's reason code — the one just set, or the one a release ended. Never the note. */
    reason?: FulfillmentHoldReason | undefined;
}

/**
 * Whether the order is still being worked: a hold or release on a delivered or cancelled order is
 * meaningless.
 * @param order - the order
 */
const isWorked = (order: OrderDocument): boolean => isAwaitingGoods(order.status);

/**
 * The hold act, in its transaction.
 * @param fulfillmentOrderId - the fulfillment order to hold
 * @param input - the reason and note
 * @param session - the act's transaction
 * @param actor - the staff member holding it, for the order's timeline
 */
const holdAct = async (
    fulfillmentOrderId: string,
    input: HoldInput,
    session: ClientSession,
    actor: string | null | undefined
): Promise<Changed> => {
    const { fulfillmentOrder, order } = await readWithOrder(fulfillmentOrderId, session);
    if (!isWorked(order) || !isHoldable(fulfillmentOrder))
        refuse(409, ERROR_CODES.DELIVERY_NOT_HOLDABLE, 'delivery.not-holdable');

    const held = await fulfillmentOrderRepository.claim(
        fulfillmentOrderId,
        fulfillmentOrder.revision,
        {
            status: statusOfLines(fulfillmentOrder.lines, true),
            holdReason: input.reason,
            ...(input.note ? { holdNote: input.note } : {}),
            ...(input.message ? { holdMessage: input.message } : {})
        },
        session
    );
    if (!held) return refuse(409, ERROR_CODES.DELIVERY_NOT_HOLDABLE, 'delivery.not-holdable');

    await reportProgress(String(held.orderId), session);
    await announceHeld(held, order, session, actor);
    return { fulfillmentOrder: held, order, reason: input.reason };
};

/**
 * The release act, in its transaction.
 * @param fulfillmentOrderId - the fulfillment order to release
 * @param session - the act's transaction
 * @param actor - the staff member releasing it, for the order's timeline
 */
const releaseAct = async (
    fulfillmentOrderId: string,
    session: ClientSession,
    actor: string | null | undefined
): Promise<Changed> => {
    const { fulfillmentOrder, order } = await readWithOrder(fulfillmentOrderId, session);
    if (!isWorked(order) || !isReleasable(fulfillmentOrder))
        refuse(409, ERROR_CODES.DELIVERY_NOT_RELEASABLE, 'delivery.not-releasable');

    const released = await fulfillmentOrderRepository.claim(
        fulfillmentOrderId,
        fulfillmentOrder.revision,
        {
            status: statusOfLines(fulfillmentOrder.lines, false),
            unset: ['holdReason', 'holdNote', 'holdMessage']
        },
        session
    );
    if (!released)
        return refuse(409, ERROR_CODES.DELIVERY_NOT_RELEASABLE, 'delivery.not-releasable');

    await reportProgress(String(released.orderId), session);
    await announceReleased(released, session, actor);
    // The code is read from the record before the write: it is gone from `released`.
    return { fulfillmentOrder: released, order, reason: fulfillmentOrder.holdReason };
};

/**
 * Run a hold or a release, then answer with the fulfillment order.
 * @param fulfillmentOrderId - the fulfillment order
 * @param act - the act to run
 * @param action - the audit action to record on success
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 */
const guarded = (
    fulfillmentOrderId: string,
    act: (session: ClientSession) => Promise<Changed>,
    action: (typeof deliveryAuditActions)[keyof typeof deliveryAuditActions],
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<FulfillmentOrder> | ResponseReject> =>
    runAct(act).then((result) => {
        if (result.refused) return result.reject;
        const { fulfillmentOrder, reason } = result.value;
        recordAudit(context, {
            action,
            outcome: 'success',
            targetType: 'order',
            targetId: String(fulfillmentOrder.orderId),
            // The code only, never `holdNote`: free text the operator log has no business
            // holding (it reaches Loki unhashed).
            metadata: { fulfillmentOrderId, ...(reason ? { reason } : {}) }
        });
        return orderService
            .getById(String(fulfillmentOrder.orderId))
            .then((fresh) =>
                generateSuccess(
                    viewFulfillmentOrder(fulfillmentOrder, fresh ?? result.value.order, authContext)
                )
            );
    });

/**
 * Put a fulfillment order on hold.
 *
 * @param fulfillmentOrderId - the fulfillment order
 * @param input - why, and an optional note
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 */
export const holdFulfillmentOrder = (
    fulfillmentOrderId: string,
    input: HoldInput,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<FulfillmentOrder> | ResponseReject> =>
    guarded(
        fulfillmentOrderId,
        (session) => holdAct(fulfillmentOrderId, input, session, context.caller.id),
        deliveryAuditActions.ADMIN_FULFILLMENT_ORDER_HELD,
        authContext,
        context
    );

/**
 * Release a fulfillment order from hold. A hold for `awaiting_stock` is refused.
 *
 * @param fulfillmentOrderId - the fulfillment order
 * @param authContext - the caller, for the response's own `actions`
 * @param context - the caller, for the audit entry
 */
export const releaseFulfillmentOrder = (
    fulfillmentOrderId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<FulfillmentOrder> | ResponseReject> =>
    guarded(
        fulfillmentOrderId,
        (session) => releaseAct(fulfillmentOrderId, session, context.caller.id),
        deliveryAuditActions.ADMIN_FULFILLMENT_ORDER_RELEASED,
        authContext,
        context
    );
