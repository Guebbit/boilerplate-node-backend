/**
 * @module
 * A payment's lifecycle past the money moving: erasure's detach, an account's own export, and the
 * sweep that clears out abandoned attempts.
 */

import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import type { Lean } from '@infrastructure/persistence/create-repository';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';

/**
 * `USER_DELETED`'s listener. Unsets `userId` on every payment this account
 * made; the payment row itself is never touched, same as `orders`' detach.
 *
 * @param userId - the erased account's id
 */
export const detachUserId = (userId: string): Promise<void> =>
    paymentRepository.detachUserId(userId).then((detached) => {
        if (detached > 0)
            logger.info({
                message: 'Detached payments from an erased account.',
                userId,
                detached
            });
    });

/**
 * Every payment this account made — for the account's own data export. Unpaginated on purpose:
 * an export is a one-time full answer, not a listing a client pages through.
 *
 * @param userId - the caller's own id
 */
export const findOwnPayments = (userId: string): Promise<Lean<PaymentDocument>[]> =>
    // `limit` well past `findAll`'s own 1000-row default — an export answers "all of it", not a
    // page of it.
    paymentRepository.findAll(paymentRepository.ownerScope(userId), { limit: 100_000 });

/**
 * `ops/reap-payments.ts`'s sweep. Deletes payment attempts that never reached `succeeded` or
 * `refunded` and have not been touched in `NODE_PAYMENT_ABANDONED_RETENTION_DAYS` (default 30) —
 * an open checkout the customer walked away from (a declined card nobody retried, a challenge
 * nobody answered), not a financial record. A settled payment is never a candidate here or on
 * any other timer; see `docs/modules/payments.md`'s retention section.
 *
 * @returns how many abandoned payment attempts were deleted
 */
export const reapAbandonedPayments = (): Promise<number> => {
    const retentionDays = environmentNumber('NODE_PAYMENT_ABANDONED_RETENTION_DAYS', 30, 1);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    return paymentRepository.deleteAbandonedBefore(cutoff).then((deleted) => {
        if (deleted > 0) logger.info({ message: 'Deleted abandoned payment attempts.', deleted });
        return deleted;
    });
};
