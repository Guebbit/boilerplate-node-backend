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

import { systemCallerContext } from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
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
import { announceInTransaction } from '@kernel/outbox';
import type { ClientSession } from 'mongoose';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from '../analytics';
import { ordersAuditActions } from '../audit';
import { ORDER_CANCELLED } from '../events';
import { orderRepository } from '../repository';
import { ORDER_EVENTS, statusesLeadingTo, type OrderActor } from '../domain';
import { bankTransferExpiredEmail, cardHoldExpiredEmail, orderCancelledEmail } from '../emails';
import { getById } from './read';
import { withTimeline } from './timeline';
import { mailBuyer } from './notify';
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
 * @param by - who cancelled, for the timeline row: the lifecycle's own actor kind
 * @param actorId - the account that cancelled, when a person did
 * @returns the cancelled order, or `null` when the conditional move matched nothing
 */
const moveToCancelled = (
    id: string,
    from: readonly string[],
    scope: Record<string, unknown> | undefined,
    refund: boolean,
    by: OrderActor,
    actorId: string | undefined
): Promise<OrderDocument | null> =>
    announceInTransaction(
        async (session) => {
            const order = await withTimeline(
                (active) =>
                    orderRepository.updateStatusIfIn(
                        id,
                        from,
                        OrderStatus.cancelled,
                        scope,
                        active
                    ),
                () => [{ type: 'cancelled', actor: actorId, data: { by } }]
            )(session);
            if (order) await giveBackStock(id, session);
            return order;
        },
        () => ({ name: ORDER_CANCELLED, payload: { orderId: id, refund }, aggregateId: id })
    ).then((order) =>
        order ? inventoryService.refreshStockCacheForOrder(id).then(() => order) : order
    );

/**
 * Everything a successful cancel unlocks after its commit: the audit row, the analytics event, and
 * the customer's explanation by mail — the sweep's own expiry notice, or, when a person cancelled,
 * the cancelled notice saying what became of their money. The refund itself is not here: it rides
 * the `order.cancelled` row the cancel's own transaction wrote.
 * @param context - the caller's context; absent for a system-initiated cancel (the reservation
 *   sweep), still audited as a system actor and
 *   reported under its own analytics name
 * @param viaReservationExpiry - true only for the `RESERVATION_EXPIRED` listener. The expiry
 *   notice and the expiry analytics event are for a hold that timed out, never for another system
 *   cancel (an account erasure also has no context)
 * @param byPerson - true when the customer or staff cancelled, and nothing else mails about it:
 *   a withdrawal has its acknowledgement, and every system cancel its own explanation or none
 */
const afterCancel = async (
    order: OrderDocument,
    refund: boolean,
    context?: CallerContext,
    viaReservationExpiry = false,
    byPerson = false
): Promise<ResponseSuccess<OrderDocument>> => {
    // A system cancel has no context and is audited as the system actor rather than skipped —
    // see the docblock above. Only the reservation sweep's own timeout is reported under the
    // expiry analytics name, so a timeout is never counted as a customer's choice to cancel and
    // an erasure's cancel is never counted as a timeout.
    const emitContext = context ?? systemCallerContext('Order');

    /*
     * The customer's answer to "what happened to my order" — the reservation sweep's own expiry,
     * never another system cancel.
     * Both payment methods get one: a `card` hold is thirty minutes, short but no shorter than
     * the time it takes to abandon a checkout tab and wonder later where the order went.
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

    /*
     * A person's cancel is mailed too, because it says what happened to money: a paid order's
     * refund is the one thing the buyer cannot see for themselves. An unpaid cancel gets the same
     * mail, so the answer is the same whoever pressed the button.
     */
    if (byPerson)
        await mailBuyer(order, (locale, name) => {
            const mail = orderCancelledEmail(locale, name, order, order.orderNumber, refund);
            void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
        });

    // No override needed: `emitContext.caller` is `SYSTEM_ACTOR`'s own caller for a system expiry
    // (built above), and `buildAuditEvent`'s defaults already read `actorUserId`/`actorRole`
    // off `context.caller.id`/`.system` — see `resolveActorRole`.
    recordAudit(emitContext, {
        action: ordersAuditActions.ORDER_CANCELLED,
        outcome: 'success',
        targetType: 'order',
        targetId: String(order._id)
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(emitContext),
        event: viaReservationExpiry
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
 * @param id - the order to cancel
 * @param authContext - the caller; absent for a system-initiated cancel
 * @param options - `refund`: an operator's choice to cancel without returning the money.
 *   `withdrawal`: the cancel is a consumer exercising their right of withdrawal (Directive Art. 9),
 *   which is wider than an ordinary customer cancel — it reaches `processing` too, since the
 *   consumer may withdraw right up to the moment the goods leave — and always refunds in full
 * @param context - omitted by every system-initiated caller (the reservation sweep),
 *   which is not a request; still audited as a
 *   system actor and reported under its own analytics name
 * @param viaReservationExpiry - see {@link afterCancel} — set only by the `RESERVATION_EXPIRED`
 *   listener, so its own explanation mail never reaches a different system cancel's customer
 */
export const cancelById = (
    id: string,
    authContext?: AuthContext,
    options: { refund?: boolean; withdrawal?: boolean } = {},
    context?: CallerContext,
    viaReservationExpiry = false
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    /*
     * A customer is always refunded — that is the promise `paid` is cancellable on, and it is not
     * theirs to waive. Only an operator chooses, because only an operator has a reason to cancel
     * without returning the money: a replacement going out, a correction, a refund handled apart.
     *
     * `update:Order` by name: a manager or moderator holds exactly this key, and asking for
     * anything broader would have missed them, silently treating them as a customer and forcing a
     * refund they had a reason not to make.
     */
    const actor = options.withdrawal ? 'withdrawal' : actorOf(authContext);
    const refund = actor === 'admin' ? (options.refund ?? true) : true;

    // The write's OWN scope: an operator's update scope, or the caller's own live orders — never
    // the read scope, which a warehouse or support account holds over every order.
    const scope = cancelScope(authContext, options.withdrawal);

    /*
     * The statuses a cancel may move from are read off the lifecycle table, not declared, and the
     * table answers per actor: a customer may cancel from `pending` and `paid`, an operator also
     * from `processing`.
     */
    return moveToCancelled(
        id,
        statusesLeadingTo(OrderStatus.cancelled, actor),
        // Part of the WRITE's filter, not a preceding read: a shipment racing this cancel
        // writes `fulfillment.shipped` in its own transaction, and exactly one of the two
        // matches. Goods that left cannot be cancelled whole.
        { ...scope, 'fulfillment.shipped': { $ne: true } },
        refund,
        actor,
        // A system cancel (the reservation sweep) has no account behind it.
        actor === 'system' ? undefined : authContext?.id
    ).then((order) =>
        order
            ? afterCancel(
                  order,
                  refund,
                  context,
                  viaReservationExpiry,
                  // The withdrawal is acknowledged by `returns`; the sweep's expiry and
                  // every system cancel mail their own explanation (or, for an erased
                  // account, nobody).
                  !viaReservationExpiry && actor !== 'withdrawal' && actor !== 'system'
              )
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
 * Cancel an order whose preorder buyer was asked to keep waiting and never answered: silence is a
 * cancel, and a cancel refunds in full (FTC 16 CFR 435.2 (b)(1)(iii), CRD Art. 18). Called by
 * `returns`, which reacts to `delivery`'s record of the silence, and only for an order with nothing
 * shipped — goods that left are cancelled one fulfillment order at a time instead.
 *
 * Its own door rather than `cancelById` as the system: that one is the reservation sweep's, and must
 * never reach a paid order. The `from` set is the named event's own. The buyer is told, since a
 * refund is the one thing they cannot see for themselves.
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
        'fulfilment',
        undefined
    ).then((order) =>
        order ? afterCancel(order, true, undefined, false, true).then(() => true) : false
    );
