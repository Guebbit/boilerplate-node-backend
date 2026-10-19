/**
 * @module
 * The shop's own pause on a buyer's checkout after repeated cancellations, taken from the
 * `order.cancelled` fact. `orders` owns the count (the timeline rows); `users` owns the hold it
 * lands on. Every cancel is still processed normally: the hold only closes the NEXT checkout, and
 * staff are told so a person steps in before a bot or a loop does damage.
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
import { purchaseHoldStaffEmail } from '../emails';
import { orderEventRepository, orderRepository } from '../repository';

/**
 * Tell staff a hold was placed, in the operator's language (not the buyer's): a person reviews it
 * from the admin users list. A mail that cannot be queued is logged, never raised: the hold is
 * already in force and the list filter finds it.
 *
 * @param buyerEmail - who was paused
 * @param userId - their account id
 * @param until - when the hold ends by itself
 */
const notifyStaff = (buyerEmail: string, userId: string, until: Date): void => {
    const mail = purchaseHoldStaffEmail(getDefaultLocale(), {
        buyerEmail,
        userId,
        cancelCount: purchaseHoldCancelCount(),
        windowDays: purchaseHoldWindowDays(),
        until: until.toISOString()
    });

    void enqueueEmail(
        { to: staffNotifyEmail(), subject: mail.subject },
        mail.template,
        mail.data
    ).catch((error: unknown) =>
        logger.error({ message: 'purchase hold staff notification email failed', error })
    );
};

/**
 * When a hold on this buyer would end, if their cancellations since the last hold or staff review
 * reach the limit inside the window; `undefined` when they do not.
 *
 * @param userId - the buyer
 * @param now - the instant to count from
 */
const holdEndFor = (userId: string, now: Date): Promise<Date | undefined> =>
    Promise.all([
        userService.purchaseHoldCountingSince(userId),
        orderRepository.findCancelledIdsOf(userId)
    ])
        .then(([countingSince, cancelledIds]) =>
            orderEventRepository.findBuyerCancelTimes(cancelledIds, countingSince)
        )
        .then((times) =>
            purchaseHoldUntil(times, purchaseHoldCancelCount(), purchaseHoldWindowDays(), now)
        );

/**
 * Take a hold when the buyer's own cancellations reach the limit. Only a cancel the buyer made
 * counts: staff, the system, a hold that ran out and a withdrawal are other causes. At-least-once
 * delivery is safe: once the hold lands its own `setAt` is where counting restarts, so a
 * redelivered event counts nothing. A failure is logged and never rejected: the count is state, not
 * a counter, so the next cancel finds the same cancels and takes the hold then, while a rejection
 * here would hold back the order's later events (the refund mail).
 *
 * @param payload - the `order.cancelled` fact
 */
export const considerPurchaseHold = ({
    orderId,
    cause
}: DomainEventMap['order.cancelled']): Promise<void> => {
    if (cause !== 'customer') return Promise.resolve();

    return orderRepository
        .findById(orderId)
        .then((order) => {
            // An order with no buyer left (erased account) has nobody to pause.
            const userId = order?.userId ? String(order.userId) : undefined;
            if (!order || !userId) return;

            return holdEndFor(userId, new Date()).then((until) => {
                if (!until) return;

                return userService
                    .takeAutomaticPurchaseHold(userId, until, systemCallerContext('User'))
                    .then((taken) => {
                        if (taken) notifyStaff(order.email, userId, until);
                    });
            });
        })
        .catch((error: unknown) => {
            logger.error({ message: 'purchase hold check failed', orderId, error });
        });
};
