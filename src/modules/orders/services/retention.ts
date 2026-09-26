/**
 * @module
 * What survives an erased account, and for how long. An order is an invoice — kept under
 * Art. 17(3)(b)/(e) regardless of what happens to the account that placed it — so erasure detaches
 * the person from it and a later sweep scrubs the PII that is left.
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { orderRepository } from '../repository';

/**
 * DDD-D6's `personalData.erase` hook. Unsets `userId` on every order this account placed and
 * marks each for `scripts/ops/reap-orders.ts` to scrub after `NODE_ORDER_PII_RETENTION_DAYS`
 * (default 3650, ~10 years — the outer edge of common commercial record-keeping periods) FROM ITS
 * OWN `createdAt`, not from today — see `orderRepository.detachUserId`'s own per-order clock. The
 * orders themselves are never touched here: they are invoices, kept under Art. 17(3)(b)/(e)
 * regardless of what happens to the account that placed them.
 *
 * @param userId - the erased account's id
 * @param session - joins the detach to the hard-delete transaction calling this hook
 */
export const detachUserId = (userId: string, session: ClientSession): Promise<void> => {
    const retentionDays = environmentNumber('NODE_ORDER_PII_RETENTION_DAYS', 3650, 1);

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
