/**
 * @module
 * What survives an erased account, and for how long. An order is an invoice — kept under
 * Art. 17(3)(b)/(e) regardless of what happens to the account that placed it — so erasure detaches
 * the person from it and a later sweep scrubs the PII that is left.
 */

import type { ClientSession } from 'mongoose';
import { SYSTEM_ACTOR } from '@kernel/permissions';
import type { AfterErase } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { orderRepository } from '../repository';
import { orderPiiRetentionDays } from '../config';
import { cancelById } from './cancel';

/**
 * DDD-D6's `personalData.erase` hook. Unsets `userId` on every order this account placed and
 * marks each for `scripts/ops/reap-orders.ts` to scrub after `NODE_ORDER_PII_RETENTION_DAYS`
 * (default 3650, ~10 years — the outer edge of common commercial record-keeping periods) FROM ITS
 * OWN `createdAt`, not from today — see `orderRepository.detachUserId`'s own per-order clock, which
 * scrubs a never-paid order AT ONCE instead: it never became the invoice this retention exists
 * for. The orders themselves are never touched here: they are invoices, kept under
 * Art. 17(3)(b)/(e) regardless of what happens to the account that placed them.
 *
 * @param userId - the erased account's id
 * @param session - joins the detach to the hard-delete transaction calling this hook
 */
export const detachUserId = (userId: string, session: ClientSession): Promise<void> => {
    const retentionDays = orderPiiRetentionDays();

    return orderRepository.detachUserId(userId, retentionDays, session).then((detached) => {
        if (detached > 0)
            // Stryker disable next-line all
            logger.info({ message: 'Detached orders from an erased account.', userId, detached });
    });
};

/**
 * `scripts/ops/reap-orders.ts`'s sweep. Scrubs the remaining PII on every order
 * whose retention window (stamped by {@link detachUserId}) has elapsed.
 *
 * @returns how many orders were scrubbed
 */
export const anonymizeDueOrders = (): Promise<number> =>
    orderRepository.scrubDueForAnonymization(new Date()).then((scrubbed) => {
        if (scrubbed > 0) {
            // Stryker disable next-line all
            logger.info({ message: 'Anonymized orders past retention.', scrubbed });
        }
        return scrubbed;
    });

/**
 * Cancels each order through the reservation sweep's own path — `cancelById` as the system, which
 * releases the stock hold and, through `ORDER_CANCELLED`, cancels the open payment intent.
 *
 * Not the expiry mail: the address belongs to an account that no longer exists. Never rejects:
 * one order failing (a payment racing in, a write conflict) is logged and the rest go on, since
 * the reservation sweep will still cancel what was missed when its hold times out.
 *
 * @param orderIds - the never-paid orders of the erased account
 */
const cancelUnpaidOrders = (orderIds: readonly string[]): Promise<void> =>
    Promise.all(
        orderIds.map((orderId) =>
            cancelById(orderId, SYSTEM_ACTOR)
                .then((result) => {
                    if (!result.success)
                        // Stryker disable next-line all
                        logger.warn({
                            message: "An erased account's unpaid order was not cancelled.",
                            orderId,
                            status: result.status
                        });
                })
                .catch((error: unknown) => {
                    // Stryker disable all
                    logger.error({
                        message: "Cancelling an erased account's unpaid order failed.",
                        orderId,
                        error
                    });
                    // Stryker restore all
                })
        )
    ).then(() => undefined);

/**
 * `orders`' `personalData.erase` hook: {@link detachUserId}, plus the cancelling of every
 * never-paid order the account leaves behind. A paid order is only detached — it is the invoice —
 * but a never-paid one is no record of anything, and would hold its stock until the reservation
 * sweep (up to 168 hours for a bank transfer) for a buyer who no longer exists.
 *
 * The cancel is returned, not run: it moves stock and money-adjacent state at other modules,
 * which cannot roll back, so it runs only after the erasure has committed. The ids are read here,
 * before the detach unsets the `userId` that finds them.
 *
 * @param userId - the erased account's id
 * @param session - joins the detach to the hard-delete transaction calling this hook
 * @returns the cancel, for the caller to run after the commit; absent when there is nothing to cancel
 */
export const eraseUserOrders = (
    userId: string,
    session: ClientSession
): Promise<AfterErase | undefined> =>
    orderRepository
        .findOpenUnpaidIdsOf(userId, session)
        .then((orderIds) =>
            detachUserId(userId, session).then(() =>
                orderIds.length > 0 ? () => cancelUnpaidOrders(orderIds) : undefined
            )
        );
