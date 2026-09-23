/**
 * @module
 * Cancelling an order, and making its consequences stick. The status move is one conditional
 * write; the hold and the refund follow it. Stock heals on its own if the release is missed — the
 * reservation TTL sees to it — so only the refund's intent is written down, and
 * `retryPendingEffects` is what discharges it when the announcement was not enough.
 */

import { callerForSubject, SYSTEM_ACTOR } from '@kernel/permissions';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
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
import { userService } from '@modules/users';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from '../analytics';
import { ordersAuditActions } from '../audit';
import { ORDER_CANCELLED } from '../events';
import { orderRepository } from '../repository';
import { statusesLeadingTo } from '../domain';
import { bankTransferExpiredEmail } from '../emails';
import { getById } from './crud';
import { callerScope, actorOf } from './scope';

/** The effect set a refunding cancel writes down. Frozen, since it rides into a `$set`. */
const PENDING_REFUND = Object.freeze(['refund'] as const);

/** How many owed effects one sweep discharges before asking to be run again. */
const SWEEP_BATCH_SIZE = 200;

/**
 * Everything a successful cancel unlocks: give back the hold, announce it, discharge the refund
 * marker once every listener heard it — then the audit row, the analytics event, and — only for a
 * sweep-driven bank-transfer timeout — the customer's own explanation by mail.
 * @param context - the caller's context; absent for the reservation-sweep's own expiry, still
 *   audited as a system actor and reported under its own analytics name
 */
const afterCancel = async (
    order: OrderDocument,
    refund: boolean,
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument>> => {
    /*
     * The hold is given back after the status write, deliberately: the conditional
     * move guarantees this runs at most once per order — a second cancel loses the
     * `$in: ['pending']` match. Belt AND braces, since `releaseForOrder` claims the
     * reservation's status conditionally too — both guards exist because the two
     * callers (a customer cancelling, the sweep's deadline) can race, and exactly
     * one moves the counters. Unchecked here: a hold already expired is an ordinary
     * sequence, the units are already back.
     */
    await inventoryService.releaseForOrder(String(order._id));

    // Whoever has to compensate hears it from here; `refund` says whether the money
    // is part of that. The fact is announced either way.
    const settled = await emitDomainEvent(ORDER_CANCELLED, {
        orderId: String(order._id),
        refund
    });

    // Discharged only once every listener actually returned. A marker left standing
    // is the sweep's whole input, so a refund that threw must not clear it here.
    if (refund && settled) await orderRepository.clearPendingEffect(String(order._id), 'refund');

    // No context: the reservation-sweep expiry, not a request. Audited as a system
    // actor rather than skipped — see the docblock above — and reported under its own
    // analytics name so a timeout is never counted as a customer's choice to cancel.
    const isSystemExpiry = !context;
    const emitContext = context ?? {
        caller: callerForSubject(SYSTEM_ACTOR, 'Order'),
        analyticsConsent: false
    };

    /*
     * The customer's answer to "what happened to my order" — sent only for the
     * sweep's own expiry, and only for a transfer: a `card` hold is thirty minutes,
     * over before anyone has read a confirmation email, and a customer's own cancel
     * needs no explanation of itself.
     */
    if (isSystemExpiry && order.paymentMethod === 'bank_transfer') {
        const buyer = order.userId ? await userService.getById(String(order.userId)) : null;
        const locale = buyer?.locale ?? getDefaultLocale();
        const mail = bankTransferExpiredEmail(locale, order);
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
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
 * @param context - omitted by the reservation-sweep expiry, which is not a request; still
 *   audited as a system actor and reported under its own analytics name
 */
export const cancelById = (
    id: string,
    authContext?: AuthContext,
    options: { refund?: boolean } = {},
    context?: CallerContext
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
                ? afterCancel(order, refund, context)
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
 * `scripts/ops/sweep-order-effects.ts`'s sweep: the retry behind {@link cancelById}'s marker.
 *
 * Re-announces `ORDER_CANCELLED` for every order still owing a refund, and clears the marker only
 * where every listener returned. Safe to run repeatedly — `payments`' conditional
 * `succeeded → refunded` move means a second announcement for an already-refunded order finds
 * nothing to do, and an order cancelled while never paid finds nothing either.
 *
 * Driven from outside, like the reservation sweep and the `reap:*` scripts: the app ships no
 * scheduler.
 *
 * @returns how many orders were settled
 */
export const retryPendingEffects = async (): Promise<number> => {
    // The grace window, not a deadline: the happy path clears its marker milliseconds after
    // writing it, so this only has to be long enough that a slow refund is not retried under it.
    const graceMinutes = environmentNumber('NODE_ORDER_EFFECT_RETRY_MINUTES', 5, 0);
    const due = await orderRepository.findWithPendingEffects(
        new Date(Date.now() - graceMinutes * 60_000),
        SWEEP_BATCH_SIZE
    );

    let settled = 0;

    for (const order of due) {
        const orderId = String(order._id);

        // `refund: true` is not re-derived: the marker exists only because the cancel decided to
        // refund, and it is the only effect this field can carry.
        if (!(await emitDomainEvent(ORDER_CANCELLED, { orderId, refund: true }))) continue;
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
