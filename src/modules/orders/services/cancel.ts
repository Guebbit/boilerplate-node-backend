/**
 * @module
 * Cancelling an order, and making its consequences stick. The status move, the hold's release, a
 * paid order's claim on stock and the `order.cancelled` outbox row are ONE transaction: a release
 * that throws rolls the status back too, so units are never lost from sale behind an order that
 * already reads `cancelled`. The refund is not in it — that is money at a provider, which cannot
 * roll back — so only the promise to make it is written down, as `refund` on the event itself.
 * `payments` opens its refund record from that event, and the outbox relay retries the event
 * until it has.
 *
 * See: docs/tools/outbox.md
 */

import { SYSTEM_ACTOR, systemCallerContext } from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
import { OrderStatus } from '@types';
import type { AuthContext } from '@types';
import type { OrderDocument } from '../model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { ownOrderFlag } from '@modules/access';
import { inventoryService } from '@modules/inventory';
import { announceInTransaction } from '@kernel/outbox';
import type { ClientSession } from 'mongoose';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from '../analytics';
import { ordersAuditActions } from '../audit';
import { ORDER_CANCELLED } from '../events';
import { orderRepository } from '../repository';
import { ORDER_EVENTS, buyerIdOf, statusesLeadingTo, type OrderActor } from '../domain';
import { getById } from './read';
import { withTimeline } from './timeline';
import { cancelScope, actorOf } from './scope';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Give an order's stock claim back, inside the cancel's own transaction. A `held` reservation is
 * released; a PAID order's hold is `committed`, so `releaseForOrder` never matches it, and
 * `releaseCommittedForOrder` gives it up instead — the units never left the shelf (they leave at
 * shipment), so nothing is restocked. Each claims its status conditionally, so calling the second
 * speculatively is safe: a hold in any other state claims nothing. A hold already expired is an
 * ordinary sequence, the units are already back.
 * @param orderId - the order being cancelled
 * @param session - the cancel's transaction
 */
const giveBackStock = async (orderId: string, session: ClientSession): Promise<void> => {
    const released = await inventoryService.releaseForOrder(orderId, 'release', session);
    if (!released) await inventoryService.releaseCommittedForOrder(orderId, session);
};

/**
 * The cancel's one atomic step: the conditional status move, and — only if it landed — the stock
 * coming back and the `order.cancelled` outbox row. The catalogue's stock cache is refreshed after
 * the commit, since that write cannot roll back.
 * @param id - the order to cancel
 * @param from - the statuses the caller may cancel from
 * @param scope - the caller's ownership scope, riding in the same filter as the write
 * @param refund - whether the cancel owes the customer their money, carried on the announcement
 * @param cause - why it was cancelled: names who did it on the timeline, and whether the hold ran out
 * @param actorId - the account that cancelled, when a person did
 * @returns the cancelled order, or `null` when the conditional move matched nothing
 */
const moveToCancelled = (
    id: string,
    from: readonly string[],
    scope: Record<string, unknown> | undefined,
    refund: boolean,
    cause: CancelCause,
    actorId: string | undefined
): Promise<OrderDocument | null> =>
    announceInTransaction(
        async (session) => {
            const order = await withTimeline(
                (active) =>
                    orderRepository.updateStatusIfIn(id, from, OrderStatus.cancelled, {
                        scope,
                        session: active
                    }),
                () => [
                    {
                        type: 'cancelled',
                        actor: actorId,
                        data: { by: CANCEL_CAUSES[cause].by, cause, refund }
                    }
                ]
            )(session);
            if (order) await giveBackStock(id, session);
            return order;
        },
        () => ({
            name: ORDER_CANCELLED,
            payload: { orderId: id, refund, cause },
            aggregateId: id
        })
    ).then((order) =>
        order ? inventoryService.refreshStockCacheForOrder(id).then(() => order) : order
    );

/**
 * Why an order was cancelled. One value per reason, never inferred from which argument happens to
 * be missing: it decides the lifecycle column, the mail, the analytics name and the refund rule
 * from {@link CANCEL_CAUSES}, and names who did it on the order's timeline.
 */
export type CancelCause =
    | 'customer'
    | 'operator'
    | 'withdrawal'
    | 'reservation_expired'
    | 'erasure'
    | 'payment_mismatch'
    | 'wait_unanswered';

/** What one {@link CancelCause} decides. */
interface CauseRules {
    /** The lifecycle column the move is read from, and who the timeline row says did it. */
    by: OrderActor;
    /**
     * The buyer's explanation, sent by `./cancel-mail.ts`: `cancelled` says what became of their money, `reservation-expiry`
     * says the hold timed out, `none` is for a cause with its own acknowledgement (a withdrawal's
     * is `returns`') or with nobody to tell (an erased account).
     */
    mail: 'cancelled' | 'reservation-expiry' | 'none';
    /** The analytics event: a timeout is never counted as a choice to cancel, nor the reverse. */
    analytics:
        | typeof ordersAnalyticsEvents.ORDER_CANCELLED
        | typeof ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED;
    /**
     * Whether the caller decides if the money goes back. Only an operator does: a customer is
     * always refunded, because that is the promise `paid` is cancellable on, and it is not theirs
     * to waive; the system's causes refund whatever was paid.
     */
    refundIsChoice: boolean;
}

/** The one table: every cause, and what it decides. A new cause is a new row and a new door. */
export const CANCEL_CAUSES = {
    customer: {
        by: 'customer',
        mail: 'cancelled',
        analytics: ordersAnalyticsEvents.ORDER_CANCELLED,
        refundIsChoice: false
    },
    operator: {
        by: 'admin',
        mail: 'cancelled',
        analytics: ordersAnalyticsEvents.ORDER_CANCELLED,
        refundIsChoice: true
    },
    withdrawal: {
        by: 'withdrawal',
        mail: 'none',
        analytics: ordersAnalyticsEvents.ORDER_CANCELLED,
        refundIsChoice: false
    },
    reservation_expired: {
        by: 'system',
        mail: 'reservation-expiry',
        analytics: ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED,
        refundIsChoice: false
    },
    erasure: {
        by: 'system',
        mail: 'none',
        analytics: ordersAnalyticsEvents.ORDER_CANCELLED,
        refundIsChoice: false
    },
    payment_mismatch: {
        by: 'system',
        mail: 'none',
        analytics: ordersAnalyticsEvents.ORDER_CANCELLED,
        refundIsChoice: false
    },
    wait_unanswered: {
        by: 'fulfilment',
        mail: 'cancelled',
        analytics: ordersAnalyticsEvents.ORDER_CANCELLED,
        refundIsChoice: false
    }
} as const satisfies Record<CancelCause, CauseRules>;

/**
 * Everything a successful cancel unlocks after its commit: the audit row and the analytics event.
 * The refund and the customer's mail are not here: they ride the `order.cancelled` row the cancel's
 * own transaction wrote.
 * @param order - the cancelled order
 * @param cause - why it was cancelled
 * @param refund - whether the cancel returned the money; with `paid`, the audit row's answer to
 *   "cancelled and refunded, or cancelled and the money kept"
 * @param context - the caller's context; absent for a system-initiated cancel, which is still
 *   audited as the system actor rather than skipped
 */
const afterCancel = (
    order: OrderDocument,
    cause: CancelCause,
    refund: boolean,
    context?: CallerContext
): ResponseSuccess<OrderDocument> => {
    const rules: CauseRules = CANCEL_CAUSES[cause];
    const emitContext = context ?? systemCallerContext('Order');

    // No override needed: `emitContext.caller` is `SYSTEM_ACTOR`'s own caller for a system cancel,
    // and `buildAuditEvent`'s defaults already read `actorUserId`/`actorRole` off
    // `context.caller.id`/`.system` — see `resolveActorRole`.
    recordAudit(emitContext, {
        action: ordersAuditActions.ORDER_CANCELLED,
        outcome: 'success',
        targetType: 'order',
        targetId: String(order._id),
        metadata: {
            cause,
            refund,
            paid: order.paidAt !== undefined,
            ...ownOrderFlag(context, buyerIdOf(order))
        }
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(emitContext),
        event: rules.analytics,
        properties: { order_id: String(order._id) }
    });

    return generateSuccess(order, 200, t('orders.cancel.success'));
};

/**
 * The one cancel behind every door: a conditional status move, not read-check-write. The filter
 * carries the caller's scope AND the cause's lifecycle column, so a racing admin "shipped" (or a
 * double-click) resolves at the storage layer — exactly one write matches. The follow-up read on
 * `null` only tells 404 from 409; the decision is already made.
 *
 * Private on purpose: a caller states a reason by choosing a door, and nothing outside this file
 * can pick a cause for another caller's reason.
 *
 * @param id - the order to cancel
 * @param cause - why; see {@link CANCEL_CAUSES}
 * @param authContext - the caller; `SYSTEM_ACTOR` for the causes nobody asked for
 * @param refundChoice - an operator's choice to cancel without returning the money; ignored by
 *   every cause that always refunds
 * @param context - omitted by every system-initiated caller, which is not a request
 */
const cancel = (
    id: string,
    cause: CancelCause,
    authContext: AuthContext,
    refundChoice?: boolean,
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const rules: CauseRules = CANCEL_CAUSES[cause];
    const refund = rules.refundIsChoice ? (refundChoice ?? true) : true;

    // The write's OWN scope: an operator's update scope, or the caller's own live orders — never
    // the read scope, which a warehouse or support account holds over every order.
    const scope = cancelScope(authContext, cause === 'withdrawal');

    /*
     * The statuses a cancel may move from are read off the lifecycle table, not declared, and the
     * table answers per column: a customer may cancel from `pending` and `paid`, an operator also
     * from `processing`.
     */
    return moveToCancelled(
        id,
        statusesLeadingTo(OrderStatus.cancelled, rules.by),
        // Part of the WRITE's filter, not a preceding read: a shipment racing this cancel
        // writes `fulfillment.shipped` in its own transaction, and exactly one of the two
        // matches. Goods that left cannot be cancelled whole.
        { ...scope, 'fulfillment.shipped': { $ne: true } },
        refund,
        cause,
        // A system cancel has no account behind it.
        rules.by === 'system' ? undefined : authContext.id
    ).then((order) =>
        order
            ? afterCancel(order, cause, refund, context)
            : // Which refusal was it? This read only informs the message — the write
              // above already decided nothing changes.
              getById(id, scope).then((existing) =>
                  existing
                      ? generateReject(409, [
                            {
                                code: ERROR_CODES.ORDER_NOT_CANCELLABLE,
                                message: t('orders.cancel.not-cancellable')
                            }
                        ])
                      : generateReject(404, [t('orders.not-found')])
              )
    );
};

/**
 * `POST /orders/{id}/cancel` — a customer cancelling their own order, or an operator cancelling
 * anyone's. Which of the two is decided here, not by the controller: whoever holds `update:Order`
 * is the operator, and asking for anything broader would have missed a role holding exactly that
 * key and treated it as a customer, forcing a refund it had a reason not to make.
 *
 * @param id - the order to cancel
 * @param authContext - the caller
 * @param options - `refund`: an operator's choice to cancel without returning the money; a
 *   customer's is always refunded
 * @param context - the caller's context, audited
 */
export const cancelOnRequestById = (
    id: string,
    authContext: AuthContext,
    options: { refund?: boolean } = {},
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    cancel(
        id,
        actorOf(authContext) === 'admin' ? 'operator' : 'customer',
        authContext,
        options.refund,
        context
    );

/**
 * A consumer exercising their right of withdrawal (Directive Art. 9): wider than an ordinary
 * customer cancel — it reaches `processing` too, since the consumer may withdraw right up to the
 * moment the goods leave — and always refunds in full. Only the buyer may; `returns` writes the
 * withdrawal's record and acknowledges it.
 *
 * @param id - the order being withdrawn from
 * @param authContext - the buyer
 * @param context - the buyer's context, audited
 */
export const withdrawById = (
    id: string,
    authContext: AuthContext,
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    cancel(id, 'withdrawal', authContext, undefined, context);

/**
 * A checkout hold that timed out: the units are already released, so the shop cancels the order
 * behind it, as `SYSTEM_ACTOR`. The buyer is told the hold ran out.
 *
 * @param id - the order whose hold expired
 */
export const expireReservationById = (
    id: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    cancel(id, 'reservation_expired', SYSTEM_ACTOR);

/**
 * A never-paid order of an account being erased. Not the expiry mail: the address belongs to an
 * account that no longer exists.
 *
 * @param id - the order to cancel
 * @internal Cancels any order with no owner check: only this module's erasure hook may call it, so it is not on `orderService`.
 */
export const cancelForErasureById = (
    id: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => cancel(id, 'erasure', SYSTEM_ACTOR);

/**
 * An order whose payment arrived as something other than what was frozen for it: cancelled by the
 * system so the money can go back. The buyer is not mailed a cancel they did not ask for.
 *
 * @param id - the order to cancel
 */
export const cancelForPaymentMismatchById = (
    id: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    cancel(id, 'payment_mismatch', SYSTEM_ACTOR);

/**
 * Cancel an order whose preorder buyer was asked to keep waiting and never answered: silence is a
 * cancel, and a cancel refunds in full (FTC 16 CFR 435.2 (b)(1)(iii)). Called by
 * `returns`, which reacts to `delivery`'s record of the silence, and only for an order with nothing
 * shipped — goods that left are cancelled one fulfillment order at a time instead.
 *
 * Its own door, with its own `from` set (the named event's own), because the system's other doors
 * must never reach a paid order. The buyer is told, since a refund is the one thing they cannot
 * see for themselves.
 *
 * @param orderId - the order to cancel
 * @returns whether this call cancelled it; `false` when it moved on (paid out, shipped, cancelled)
 */
export const cancelUnanswered = (orderId: string): Promise<boolean> =>
    moveToCancelled(
        orderId,
        ORDER_EVENTS.cancelUnanswered.from,
        { 'fulfillment.shipped': { $ne: true } },
        true,
        'wait_unanswered',
        undefined
    ).then((order) => {
        if (!order) return false;
        afterCancel(order, 'wait_unanswered', true);
        return true;
    });
