/**
 * @module
 * What survives an erased account, and for how long. An order is an invoice — kept under
 * Art. 17(3)(b)/(e) regardless of what happens to the account that placed it — so erasure detaches
 * the person from it and a later sweep scrubs the PII that is left.
 */

import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { orderRepository } from '../repository';

/**
 * `USER_DELETED`'s listener. Unsets `userId` on every order this account
 * placed and marks them for `ops/reap-orders.ts` to scrub after
 * `NODE_ORDER_PII_RETENTION_DAYS` (default 3650, ~10 years — the outer edge of common commercial
 * record-keeping periods). The orders themselves are never touched here: they are invoices,
 * kept under Art. 17(3)(b)/(e) regardless of what happens to the account that placed them.
 *
 * @param userId - the erased account's id
 */
export const detachUserId = (userId: string): Promise<void> => {
    const retentionDays = environmentNumber('NODE_ORDER_PII_RETENTION_DAYS', 3650, 1);
    const anonymizeAfter = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    return orderRepository.detachUserId(userId, anonymizeAfter).then((detached) => {
        if (detached > 0)
            logger.info({ message: 'Detached orders from an erased account.', userId, detached });
    });
};

/**
 * `ops/reap-orders.ts`'s sweep. Scrubs the remaining PII on every order
 * whose retention window (stamped by {@link detachUserId}) has elapsed.
 *
 * @returns how many orders were scrubbed
 */
export const anonymizeDueOrders = (): Promise<number> =>
    orderRepository.scrubDueForAnonymization(new Date()).then((scrubbed) => {
        if (scrubbed > 0) logger.info({ message: 'Anonymized orders past retention.', scrubbed });
        return scrubbed;
    });
