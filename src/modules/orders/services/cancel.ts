/**
 * @module
 * Cancelling an order, and making its consequences stick. The status move is one conditional
 * write; the hold and the refund follow it. A `held` reservation heals on its own if its release
 * is missed — the TTL sees to it — but a paid order's `committed` hold does not: if its restock
 * throws here, those units are lost from sale, with no retry. Only the refund's intent is written
 * down; `retryPendingEffects` is what discharges it when the announcement was not enough.
 */

import { callerForSubject, SYSTEM_ACTOR } from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { OrderStatus } from '@types';
import type { AuthContext } from '@types';
import type { OrderDocument } from '../model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { inventoryService } from '@modules/inventory';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from '../analytics';
import { ordersAuditActions } from '../audit';
import { ORDER_CANCELLED, ORDER_REFUND_OWED } from '../events';
import { orderRepository } from '../repository';
import { statusesLeadingTo } from '../domain';
import { orderEffectRetryMinutes } from '../config';
import { bankTransferExpiredEmail, cardHoldExpiredEmail } from '../emails';
import { getById } from './crud';
import { mailBuyer } from './notify';
import { callerScope, actorOf } from './scope';

/** The effect set a refunding cancel writes down. Frozen, since it rides into a `$set`. */
const PENDING_REFUND = Object.freeze(['refund'] as const);

/** How many owed effects one sweep discharges before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Everything a successful cancel unlocks: give back the hold, announce it, discharge the refund
 * marker once every listener heard it — then the audit row, the analytics event, and — only for
 * the reservation-expiry sweep itself — the customer's own explanation by mail.
 * @param context - the caller's context; absent for a system-initiated cancel (the reservation
 *   sweep, or `availability.ts`'s own product-removed cancel), still audited as a system actor and
 *   reported under its own analytics name
 * @param viaReservationExpiry - true only for the `RESERVATION_EXPIRED` listener. A missing
 *   `context` alone cannot tell "the hold timed out" apart from "the product it held became
 *   unavailable" — `availability.ts` cancels with no context too, and sends its OWN explanation
 *   (`productUnavailableCancelledEmail`), never this one
 */
const afterCancel = async (
    order: OrderDocument,
    refund: boolean,
    context?: CallerContext,
    viaReservationExpiry = false
): Promise<ResponseSuccess<OrderDocument>> => {
    /*
     * The hold is given back after the status write, deliberately: the conditional
     * move guarantees this runs at most once per order — a second cancel loses the
     * `$in: ['pending']` match. Belt AND braces, since `releaseForOrder` claims the
     * reservation's status conditionally too — both guards exist because the two
     * callers (a customer cancelling, the sweep's deadline) can race, and exactly
     * one moves the counters. Unchecked here: a hold already expired is an ordinary
     * sequence, the units are already back.
     *
     * A release that claims nothing is not automatically a no-op: a PAID order's hold is
     * `committed`, not `held`, so `releaseForOrder` never matches it — the units already left
     * `onHand` at payment, not merely `reserved`. `restockForOrder` is what gives those back, and
     * its own claim (`committed → restocked`) is exactly as safe to call speculatively: a hold
     * that is anything else claims nothing there either.
     */
    const released = await inventoryService.releaseForOrder(String(order._id));
    if (!released) await inventoryService.restockForOrder(String(order._id));

    // The fact is announced once, unconditionally — whatever a listener does with it (webhooks'
    // own delivery has its own retry story) is no longer this function's concern.
    await emitDomainEvent(ORDER_CANCELLED, {
        orderId: String(order._id),
        refund
    });

    // The refund is a SEPARATE announcement, retried on its own: re-sending `ORDER_CANCELLED`
    // to retry a stuck refund would re-deliver the customer-facing webhook every time the sweep
    // ran. Discharged only once this send actually returns.
    if (refund) {
        const refunded = await emitDomainEvent(ORDER_REFUND_OWED, { orderId: String(order._id) });
        if (refunded) await orderRepository.clearPendingEffect(String(order._id), 'refund');
    }

    // No context: the reservation-sweep expiry, not a request. Audited as a system
    // actor rather than skipped — see the docblock above — and reported under its own
    // analytics name so a timeout is never counted as a customer's choice to cancel.
    const isSystemExpiry = !context;
    const emitContext = context ?? {
        caller: callerForSubject(SYSTEM_ACTOR, 'Order'),
        analyticsConsent: false
    };

    /*
     * The customer's answer to "what happened to my order" — sent only for the reservation
     * sweep's own expiry, never for `availability.ts`'s product-removed cancel (that one mails its
     * own explanation) and never for a customer's own cancel, which needs no explanation of
     * itself. Both payment methods get one: a `card` hold is thirty minutes, short but no shorter
     * than the time it takes to abandon a checkout tab and wonder later where the order went.
     */
    if (viaReservationExpiry) {
        const build =
            order.paymentMethod === 'bank_transfer'
                ? bankTransferExpiredEmail
                : cardHoldExpiredEmail;
        await mailBuyer(order, (locale) => {
            const mail = build(locale, order);
            void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
        });
    }

    recordAudit(emitContext, {
        action: ordersAuditActions.ORDER_CANCELLED,
        outcome: 'success',
        target_type: 'order',
        target_id: String(order._id),
        ...(isSystemExpiry ? { actor_role: 'admin', actor_user_id: 'system' } : {})
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(emitContext),
        event: isSystemExpiry
            ? ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED
            : ordersAnalyticsEvents.ORDER_CANCELLED,
        properties: { order_id: String(order._id) }
    });

    return generateSuccess(order, 200, t('orders.cancel.success'));
};

/**
 * Cancel an order — the one write a customer may make, or the system makes when a reservation
 * times out unpaid. A conditional status move, not read-check-write: the filter carries the
 * caller's scope AND the `pending` requirement, so a racing admin "shipped" (or a double-click)
 * resolves at the storage layer — exactly one write matches. The follow-up read on `null` only
 * tells 404 from 409; the decision is already made.
 * @param context - omitted by every system-initiated caller (the reservation sweep,
 *   `availability.ts`'s product-removed cancel), which is not a request; still audited as a
 *   system actor and reported under its own analytics name
 * @param viaReservationExpiry - see {@link afterCancel} — set only by the `RESERVATION_EXPIRED`
 *   listener, so its own explanation mail never reaches a different system cancel's customer
 */
export const cancelById = (
    id: string,
    authContext?: AuthContext,
    options: { refund?: boolean } = {},
    context?: CallerContext,
    viaReservationExpiry = false
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    /*
     * A customer is always refunded — that is the promise `paid` is cancellable on, and it is not
     * theirs to waive. Only an operator chooses, because only an operator has a reason to cancel
     * without returning the money: a replacement going out, a correction, a refund handled apart.
     *
     * `orders.any.update` by name: a moderator or warehouse operator holds exactly this key, and
     * asking for anything broader would have missed them, silently treating them as a customer
     * and forcing a refund they had a reason not to make.
     */
    const refund = actorOf(authContext) === 'admin' ? (options.refund ?? true) : true;

    /*
     * The statuses a cancel may move from are read off the lifecycle table, not declared, and the
     * table answers per actor: a customer may cancel from `pending` and `paid`, an operator also
     * from `processing`.
     */
    return orderRepository
        .updateStatusIfIn(
            id,
            statusesLeadingTo(OrderStatus.cancelled, actorOf(authContext)),
            OrderStatus.cancelled,
            callerScope(authContext),
            /*
             * The intent to refund is written WITH the cancel, in one document write, because the
             * announcement below is not durable — `@kernel/events` has no retry, so a refund that
             * throws is logged and lost. The marker is what `retryPendingEffects` finds afterwards.
             */
            refund ? PENDING_REFUND : undefined
        )
        .then((order) =>
            order
                ? afterCancel(order, refund, context, viaReservationExpiry)
                : // Which refusal was it? This read only informs the message — the write above
                  // already decided nothing changes.
                  getById(id, callerScope(authContext)).then((existing) =>
                      existing
                          ? generateReject(409, [
                                {
                                    code: 'ORDER_NOT_CANCELLABLE',
                                    message: t('orders.cancel.not-cancellable')
                                }
                            ])
                          : generateReject(404, [t('orders.not-found')])
                  )
        );
};

/**
 * Mark a refund owed outside a cancel — `payments`' own "the money landed on an order no longer
 * payable" branch is the one caller: by the time it runs, something else already moved this
 * order to `cancelled`, so there is no cancel here to carry the marker the way `cancelById` does.
 * Feeds the same `retryPendingEffects` sweep below, and the same `ORDER_REFUND_OWED` retry path.
 *
 * @param orderId - the order whose payment settlement is putting the money back
 */
export const markRefundOwed = (orderId: string): Promise<void> =>
    orderRepository.addPendingEffect(orderId, 'refund');

/**
 * Discharge {@link markRefundOwed}'s marker once the refund it was written for actually returns.
 *
 * @param orderId - the order whose refund just landed
 */
export const clearRefundOwed = (orderId: string): Promise<void> =>
    orderRepository.clearPendingEffect(orderId, 'refund').then(() => undefined);

/**
 * `scripts/ops/sweep-order-effects.ts`'s sweep: the retry behind {@link cancelById}'s marker.
 *
 * Re-announces `ORDER_REFUND_OWED` — never `ORDER_CANCELLED` — for every order still owing a
 * refund, and clears the marker only once that send actually returns. Safe to run repeatedly —
 * `payments`' conditional `succeeded → refunded` move means a second announcement for an
 * already-refunded order finds nothing to do, and an order cancelled while never paid finds
 * nothing either.
 *
 * Driven from outside, like the reservation sweep and the `reap:*` scripts: the app ships no
 * scheduler.
 *
 * @returns how many orders were settled
 */
export const retryPendingEffects = async (): Promise<number> => {
    const due = await orderRepository.findWithPendingEffects(
        new Date(Date.now() - orderEffectRetryMinutes() * 60_000),
        SWEEP_BATCH_SIZE
    );

    let settled = 0;

    for (const order of due) {
        const orderId = String(order._id);

        // The marker exists only because the cancel decided to refund, and it is the only effect
        // this field can carry — `ORDER_REFUND_OWED` alone, never `ORDER_CANCELLED` again.
        if (!(await emitDomainEvent(ORDER_REFUND_OWED, { orderId }))) continue;
        if (await orderRepository.clearPendingEffect(orderId, 'refund')) settled += 1;
    }

    // A full batch means more is waiting. Said out loud, so a truncated run is not read as done.
    if (due.length === SWEEP_BATCH_SIZE)
        // Stryker disable all
        logger.warn(
            `Order effect sweep: hit the ${SWEEP_BATCH_SIZE}-order batch cap — run it again to continue`
        );
    // Stryker restore all

    if (due.length > 0)
        // Stryker disable next-line all
        logger.info(`Order effect sweep: ${settled} of ${due.length} owed refunds settled`);

    return settled;
};
