/**
 * @module
 * Cancelling an order, and making its consequences stick. The status move, the hold's release, a
 * paid order's claim on stock and the `order.canceled` outbox row are ONE transaction: a release
 * that throws rolls the status back too, so units are never lost from sale behind an order that
 * already reads `canceled`. The refund is not in it — that is money at a provider, which cannot
 * roll back — so only the promise to make it is written down, as `refund` on the event itself.
 * `payments` opens its refund record from that event, and the outbox relay retries the event
 * until it has.
 *
 * @see docs/understand/outbox.md#using-it
 */

import { SYSTEM_ACTOR, systemCallerContext } from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
import { OrderStatus } from '@types';
import type { AuthContext, OrderCancelCause } from '@types';
import type { OrderDocument } from '../model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { ownOrderFlag } from '@modules/access';
import { inventoryService } from '@modules/inventory';
import { announceInTransaction, announceWithin } from '@kernel/outbox';
import type { OutboxAnnouncement } from '@kernel/outbox';
import type { ClientSession } from 'mongoose';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from '../analytics';
import { ordersAuditActions } from '../audit';
import { ORDER_CANCELED } from '../events';
import { orderRepository } from '../repository';
import { buyerIdOf, statusesLeadingTo, type OrderActor } from '../domain';
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
 * @param orderId - the order being canceled
 * @param session - the cancel's transaction
 */
const giveBackStock = async (orderId: string, session: ClientSession): Promise<void> => {
    const released = await inventoryService.releaseForOrder(orderId, 'release', session);
    if (!released) await inventoryService.releaseCommittedForOrder(orderId, session);
};

/**
 * The cancel's one atomic step: the conditional status move, and — only if it landed — the stock
 * coming back and the `order.canceled` outbox row. The catalogue's stock cache is refreshed after
 * the commit, since that write cannot roll back.
 * @param id - the order to cancel
 * @param from - the statuses the caller may cancel from
 * @param scope - the caller's ownership scope, riding in the same filter as the write
 * @param refund - whether the cancel owes the customer their money, carried on the announcement
 * @param cause - why it was canceled: names who did it on the timeline, and whether the hold ran out
 * @param actorId - the account that canceled, when a person did
 * @param informedAt - when the shop was told, for a cancel that is the buyer's own act; carried on
 *   the announcement as the start of the refund deadline
 * @param within - a transaction the caller already owns: the cancel joins it, and the caller
 *   commits, nudges the relay and refreshes the stock cache (see {@link withdrawWithin})
 * @returns the canceled order, or `null` when the conditional move matched nothing
 */
const moveToCanceled = (
    id: string,
    from: readonly string[],
    scope: Record<string, unknown> | undefined,
    refund: boolean,
    cause: CancelCause,
    actorId: string | undefined,
    informedAt: Date | undefined,
    within?: ClientSession
): Promise<OrderDocument | null> => {
    const write = async (session: ClientSession): Promise<OrderDocument | null> => {
        const order = await withTimeline(
            (active) =>
                orderRepository.updateStatusIfIn(id, from, OrderStatus.canceled, {
                    scope,
                    session: active
                }),
            () => [
                {
                    type: 'canceled',
                    actor: actorId,
                    data: { by: CANCEL_CAUSES[cause].by, cause, refund }
                }
            ]
        )(session);
        if (order) await giveBackStock(id, session);
        return order;
    };
    const announce = (): OutboxAnnouncement<typeof ORDER_CANCELED> => ({
        name: ORDER_CANCELED,
        payload: {
            orderId: id,
            refund,
            cause,
            ...(informedAt ? { informedAt: informedAt.toISOString() } : {})
        },
        aggregateId: id
    });
    if (within) return announceWithin(within, write, announce);
    return announceInTransaction(write, announce).then((order) =>
        order ? inventoryService.refreshStockCacheForOrder(id).then(() => order) : order
    );
};

/**
 * Why an order was canceled. One value per reason, never inferred from which argument happens to
 * be missing: it decides the lifecycle column, the mail, the analytics name and the refund rule
 * from {@link CANCEL_CAUSES}, and names who did it on the order's timeline. The values are the
 * contract's (`order.canceled`'s `cause` in `asyncapi.domain-events.yaml`), so a cause added there
 * fails `CANCEL_CAUSES`'s `satisfies` until it has rules.
 */
export type CancelCause = OrderCancelCause;

/** What one {@link CancelCause} decides. */
interface CauseRules {
    /** The lifecycle column the move is read from, and who the timeline row says did it. */
    by: OrderActor;
    /**
     * The buyer's explanation, sent by `./cancel-mail.ts`: `canceled` says what became of their money, `reservation-expiry`
     * says the hold timed out, `none` is for a cause with its own acknowledgement (a withdrawal's
     * is `returns`') or with nobody to tell (an erased account).
     */
    mail: 'canceled' | 'reservation-expiry' | 'none';
    /** The analytics event: a timeout is never counted as a choice to cancel, nor the reverse. */
    analytics:
        | typeof ordersAnalyticsEvents.ORDER_CANCELED
        | typeof ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED;
    /**
     * Whether the caller decides if the money goes back. Only an operator does: a customer is
     * always refunded, because that is the promise `paid` is cancelable on, and it is not theirs
     * to waive; the system's causes refund whatever was paid. Read by `cancel()` only, so `lost`
     * (which never goes through it and refunds nothing) leaves it `false`.
     */
    refundIsChoice: boolean;
}

/** The one table: every cause, and what it decides. A new cause is a new row and a new door. */
export const CANCEL_CAUSES = {
    customer: {
        by: 'customer',
        mail: 'canceled',
        analytics: ordersAnalyticsEvents.ORDER_CANCELED,
        refundIsChoice: false
    },
    operator: {
        by: 'admin',
        mail: 'canceled',
        analytics: ordersAnalyticsEvents.ORDER_CANCELED,
        refundIsChoice: true
    },
    withdrawal: {
        by: 'withdrawal',
        mail: 'none',
        analytics: ordersAnalyticsEvents.ORDER_CANCELED,
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
        analytics: ordersAnalyticsEvents.ORDER_CANCELED,
        refundIsChoice: false
    },
    payment_mismatch: {
        by: 'system',
        mail: 'none',
        analytics: ordersAnalyticsEvents.ORDER_CANCELED,
        refundIsChoice: false
    },
    /**
     * Written by `markUndeliverable`, not by `cancel()`: the remainder cancel (returns' transaction)
     * already refunded, so this cause carries `refund: false` and `refundIsChoice` does not apply.
     */
    lost: {
        by: 'system',
        mail: 'none',
        analytics: ordersAnalyticsEvents.ORDER_CANCELED,
        refundIsChoice: false
    }
} as const satisfies Record<CancelCause, CauseRules>;

/**
 * Everything a successful cancel unlocks after its commit: the audit row and the analytics event.
 * The refund and the customer's mail are not here: they ride the `order.canceled` row the cancel's
 * own transaction wrote.
 * @param order - the canceled order
 * @param cause - why it was canceled
 * @param refund - whether the cancel returned the money; with `paid`, the audit row's answer to
 *   "canceled and refunded, or canceled and the money kept"
 * @param context - the caller's context; absent for a system-initiated cancel, which is still
 *   audited as the system actor rather than skipped
 */
export const afterCancel = (
    order: OrderDocument,
    cause: CancelCause,
    refund: boolean,
    context?: CallerContext
): ResponseSuccess<OrderDocument> => {
    const rules: CauseRules = CANCEL_CAUSES[cause];
    const emitContext = context ?? systemCallerContext('Order');

    /**
     * No override needed: `emitContext.caller` is `SYSTEM_ACTOR`'s own caller for a system cancel,
     * and `buildAuditEvent`'s defaults already read `actorUserId`/`actorRole` off
     * `context.caller.id`/`.system` — see `resolveActorRole`.
     */
    recordAudit(emitContext, {
        action: ordersAuditActions.ORDER_CANCELED,
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

    return generateSuccess(order, 200);
};

/**
 * What one cancel decided, before anything is reported: the order it moved (`null` when the
 * conditional move matched nothing) and what the report needs.
 */
interface CancelAttempt {
    order: OrderDocument | null;
    refund: boolean;
    scope: Record<string, unknown> | undefined;
}

/**
 * The cancel's write, in its own transaction or in the caller's. The filter carries the caller's
 * scope AND the cause's lifecycle column, so a racing admin "shipped" (or a double-click) resolves
 * at the storage layer — exactly one write matches.
 *
 * @param id - the order to cancel
 * @param cause - why; see {@link CANCEL_CAUSES}
 * @param authContext - the caller; `SYSTEM_ACTOR` for the causes nobody asked for
 * @param refundChoice - an operator's choice to cancel without returning the money
 * @param onBuyersBehalf - staff recording a withdrawal: the write runs on the operator's scope
 * @param statedAt - the day the buyer stated a withdrawal staff record back-dated
 * @param within - a transaction the caller owns, when the cancel must commit with the caller's writes
 */
const attemptCancel = (
    id: string,
    cause: CancelCause,
    authContext: AuthContext,
    refundChoice: boolean | undefined,
    onBuyersBehalf: boolean,
    statedAt: Date | undefined,
    within?: ClientSession
): Promise<CancelAttempt> => {
    const rules: CauseRules = CANCEL_CAUSES[cause];
    const refund = rules.refundIsChoice ? (refundChoice ?? true) : true;

    /**
     * The write's OWN scope: an operator's update scope, or the caller's own live orders — never
     * the read scope, which a warehouse or support account holds over every order.
     */
    const scope = cancelScope(authContext, cause === 'withdrawal' && !onBuyersBehalf);

    /**
     * The statuses a cancel may move from are read off the lifecycle table, not declared, and the
     * table answers per column: a customer may cancel from `pending` and `paid`, an operator also
     * from `processing`.
     */
    return moveToCanceled(
        id,
        statusesLeadingTo(OrderStatus.canceled, rules.by),
        /**
         * Part of the WRITE's filter, not a preceding read: a shipment racing this cancel
         * writes `fulfillment.shipped` in its own transaction, and exactly one of the two
         * matches. Goods that left cannot be canceled whole.
         */
        { ...scope, 'fulfillment.shipped': { $ne: true } },
        refund,
        cause,
        // A system cancel has no account behind it.
        rules.by === 'system' ? undefined : authContext.id,
        // Only the buyer's own act starts the refund clock; the shop's cancels have no such date.
        cause === 'customer' || cause === 'withdrawal' ? (statedAt ?? new Date()) : undefined,
        within
    ).then((order) => ({ order, refund, scope }));
};

/**
 * Which refusal a cancel that moved nothing was. This read only informs the message — the write
 * already decided nothing changes.
 * @param id - the order
 * @param scope - the caller's write scope
 */
const refusalOf = (
    id: string,
    scope: Record<string, unknown> | undefined
): Promise<ResponseReject> =>
    getById(id, scope).then((existing) =>
        existing
            ? generateReject(409, [
                  {
                      code: ERROR_CODES.ORDER_NOT_CANCELABLE,
                      message: t('orders.cancel.not-cancelable')
                  }
              ])
            : generateReject(404, [t('orders.not-found')])
    );

/**
 * The one cancel behind every door: a conditional status move, not read-check-write. The follow-up
 * read on `null` only tells 404 from 409; the decision is already made.
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
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    attemptCancel(id, cause, authContext, refundChoice, false, undefined).then<
        ResponseSuccess<OrderDocument> | ResponseReject
    >(({ order, refund, scope }) =>
        order ? afterCancel(order, cause, refund, context) : refusalOf(id, scope)
    );

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
 * What {@link withdrawWithin} hands back: the cancel's refusal, or `settle` — the steps that
 * follow the owner's commit (stock cache, audit row, analytics event).
 */
export type WithinWithdrawal =
    ResponseReject | { success: true; settle: () => Promise<ResponseSuccess<OrderDocument>> };

/**
 * A withdrawal's cancel inside a transaction the CALLER owns, so `returns` can commit the dated
 * withdrawal record and the cancel together or not at all. Buyer, or staff recording the one the
 * buyer stated by phone, email or letter: the same cancel (cause `withdrawal`, refunded in full),
 * run on the operator's scope when staff do it, the timeline naming the staff member. `returns`
 * has checked the keys.
 *
 * Opens no transaction and reports nothing: the owner commits, nudges the outbox, then calls
 * `settle` for the stock cache, the audit row and the analytics event.
 *
 * @param session - the caller's open transaction
 * @param id - the order being withdrawn from
 * @param authContext - the buyer, or the staff member
 * @param context - the caller's context, audited by `settle`
 * @param onBuyersBehalf - true when staff record it
 * @param statedAt - the day the buyer stated it: the refund deadline counts from there
 * @returns the refusal, or the moved order and the after-commit step
 */
export const withdrawWithin = (
    session: ClientSession,
    id: string,
    authContext: AuthContext,
    context: CallerContext | undefined,
    onBuyersBehalf: boolean,
    statedAt?: Date
): Promise<WithinWithdrawal> =>
    attemptCancel(
        id,
        'withdrawal',
        authContext,
        undefined,
        onBuyersBehalf,
        statedAt,
        session
    ).then<WithinWithdrawal>(({ order, refund, scope }) =>
        order
            ? {
                  success: true as const,
                  settle: () =>
                      inventoryService
                          .refreshStockCacheForOrder(id)
                          .then(() => afterCancel(order, 'withdrawal', refund, context))
              }
            : refusalOf(id, scope)
    );

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
 * An order whose payment arrived as something other than what was frozen for it: canceled by the
 * system so the money can go back. The buyer is not mailed a cancel they did not ask for.
 *
 * @param id - the order to cancel
 */
export const cancelForPaymentMismatchById = (
    id: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    cancel(id, 'payment_mismatch', SYSTEM_ACTOR);
