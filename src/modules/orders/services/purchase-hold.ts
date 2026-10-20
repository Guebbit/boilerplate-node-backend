/**
 * @module
 * The shop's own answer to repeated cancellations, taken from the `order.cancelled` fact. `orders`
 * owns the count (the timeline rows); `users` owns the hold and the review flag it lands on. Every
 * cancel is still processed normally: the rule only closes the NEXT checkout or flags the account,
 * and staff are told either way so a person steps in before a bot or a loop does damage.
 *
 * Two counts, one limit and one window:
 *
 * - PAUSE: unpaid cancellations (the cancel button or a withdrawal through returns, one legal act
 *   behind two doors) plus orders whose reservation ran out unpaid. Those are what bots do.
 * - REVIEW ONLY: paid cancellations by either door. Cancelling before dispatch is a statutory
 *   withdrawal, so it never pauses anyone; it only flags the account for a person to look at.
 *
 * See: docs/modules/orders.md#the-purchase-hold
 */

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale } from '@infrastructure/i18n';
import type { DomainEventMap } from '@kernel/events';
import { systemCallerContext } from '@kernel/permissions';
import { userService } from '@modules/users';
import { purchaseHoldCancelCount, purchaseHoldWindowDays, staffNotifyEmail } from '../config';
import { purchaseHoldUntil } from '../domain';
import { purchaseHoldStaffEmail, type PurchaseHoldStaffNotice } from '../emails';
import { orderEventRepository, orderRepository } from '../repository';

/** The causes that can move either count; every other cause is staff's or the system's own doing. */
const COUNTED_CAUSES: ReadonlySet<string> = new Set([
    'customer',
    'withdrawal',
    'reservation_expired'
]);

/**
 * Tell staff the rule fired, in the operator's language (not the buyer's): a person reviews it from
 * the admin users list. A mail that cannot be queued is logged, never raised: the hold or the flag
 * is already in force and the list filter finds it.
 *
 * @param what - which wording, who, and for a pause until when
 */
const notifyStaff = (
    what: Pick<PurchaseHoldStaffNotice, 'buyerEmail' | 'userId'> &
        ({ kind: 'paused'; until: Date } | { kind: 'review' })
): void => {
    const mail = purchaseHoldStaffEmail(getDefaultLocale(), {
        buyerEmail: what.buyerEmail,
        userId: what.userId,
        cancelCount: purchaseHoldCancelCount(),
        windowDays: purchaseHoldWindowDays(),
        ...(what.kind === 'paused'
            ? { kind: 'paused', until: what.until.toISOString() }
            : { kind: 'review' })
    });

    void enqueueEmail(
        { to: staffNotifyEmail(), subject: mail.subject },
        mail.template,
        mail.data
    ).catch((error: unknown) =>
        logger.error({ message: 'purchase hold staff notification email failed', error })
    );
};

/** What the rule found for one buyer: when a pause would end, and whether paid cancels need a look. */
interface Findings {
    /** When a hold would end, if the unpaid cancellations reach the limit; `undefined` otherwise. */
    pauseUntil: Date | undefined;
    /** Whether the paid cancellations reach the limit inside the window. */
    review: boolean;
}

/**
 * Count a buyer's cancellations since the last hold or staff review, in both ways.
 *
 * @param userId - the buyer
 * @param now - the instant to count from
 */
const findingsFor = (userId: string, now: Date): Promise<Findings> =>
    Promise.all([
        userService.purchaseHoldCountingSince(userId),
        orderRepository.findCancelledIdsOf(userId)
    ])
        .then(([countingSince, { paid, unpaid }]) =>
            Promise.all([
                orderEventRepository.findBuyerCancelTimes(unpaid, countingSince, true),
                orderEventRepository.findBuyerCancelTimes(paid, countingSince, false)
            ])
        )
        .then(([unpaidTimes, paidTimes]) => ({
            pauseUntil: purchaseHoldUntil(
                unpaidTimes,
                purchaseHoldCancelCount(),
                purchaseHoldWindowDays(),
                now
            ),
            review:
                purchaseHoldUntil(
                    paidTimes,
                    purchaseHoldCancelCount(),
                    purchaseHoldWindowDays(),
                    now
                ) !== undefined
        }));

/**
 * Act on what the count found: take the pause (which flags the account in the same write) or, with
 * only paid cancellations over the limit, flag the account without pausing it. At-least-once
 * delivery is safe both ways: a taken hold restarts the count at its own `setAt`, and a flag already
 * set is left alone, so a redelivered event mails staff nothing.
 *
 * @param userId - the buyer
 * @param email - the order's address, for the staff mail
 * @param findings - what the count found
 */
const actOn = (userId: string, email: string, findings: Findings): Promise<void> => {
    if (findings.pauseUntil) {
        const until = findings.pauseUntil;
        return userService
            .takeAutomaticPurchaseHold(userId, until, systemCallerContext('User'), {
                cancelCount: purchaseHoldCancelCount(),
                windowDays: purchaseHoldWindowDays()
            })
            .then((taken) => {
                if (taken) notifyStaff({ kind: 'paused', buyerEmail: email, userId, until });
            });
    }
    if (!findings.review) return Promise.resolve();

    return userService
        .flagPurchaseHoldReview(userId, systemCallerContext('User'))
        .then((flagged) => {
            if (flagged) notifyStaff({ kind: 'review', buyerEmail: email, userId });
        });
};

/**
 * Apply the rule when a buyer cancels. Only a cancel the buyer made counts (by either door), or an
 * order whose reservation ran out unpaid: staff, an erasure and a payment mismatch are other
 * causes. A failure is logged and never rejected: the count is state, not a counter,
 * so the next cancel finds the same cancels and acts then, while a rejection here would hold back
 * the order's later events (the refund mail).
 *
 * @param payload - the `order.cancelled` fact
 */
export const considerPurchaseHold = ({
    orderId,
    cause
}: DomainEventMap['order.cancelled']): Promise<void> => {
    if (!COUNTED_CAUSES.has(cause)) return Promise.resolve();

    return orderRepository
        .findById(orderId)
        .then((order) => {
            // An order with no buyer left (erased account) has nobody to act on.
            const userId = order?.userId ? String(order.userId) : undefined;
            if (!order || !userId) return;

            return findingsFor(userId, new Date()).then((findings) =>
                actOn(userId, order.email, findings)
            );
        })
        .catch((error: unknown) => {
            logger.error({ message: 'purchase hold check failed', orderId, error });
        });
};
