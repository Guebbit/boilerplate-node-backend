/**
 * @module
 * The profile sync: a changed email reaches the Zammad customer the account is mapped to. The
 * `user.profile_changed` subscriber writes one row per account; the sweep reads the CURRENT address
 * and overwrites the customer's, so a burst of changes is one call and a stale event cannot write
 * stale data (the event carries field names, never values). Only the address is sent.
 *
 * @see docs/modules/zammad.md#profile-sync
 */

import { logger } from '@infrastructure/adapters/logger';
import { outboxBackoffMs } from '@kernel/outbox';
import { outboxConfig } from '@kernel/config';
import type { DomainEventMap } from '@kernel/events';
import { userService } from '@modules/users';
import { updateCustomer, ZammadRequestError } from '../client';
import { zammadEnabled } from '../config';
import type { ZammadProfileSyncDocument } from '../model';
import {
    claimDueProfileSync,
    dropProfileSync,
    finishProfileSync,
    findCustomer,
    requestProfileSync,
    rescheduleProfileSync
} from '../repository';

/** The most accounts one pass syncs. */
const PASS_LIMIT = 100;

/**
 * `user.profile_changed`: note the account, but only when its email moved and it is a Zammad
 * customer: Zammad holds nothing else of the account, and an account that never wrote to the help
 * desk has nothing there to keep current.
 *
 * @param event - the change, by account
 */
export const onProfileChanged = (event: DomainEventMap['user.profile_changed']): Promise<void> =>
    zammadEnabled() && event.changed.includes('email')
        ? findCustomer(event.userId).then((mapping) =>
              mapping ? requestProfileSync(event.userId).then(() => undefined) : undefined
          )
        : Promise.resolve();

/**
 * A sync failed. Zammad refusing for good (the address is another customer's, or the customer is
 * gone) drops the row: staff move the tickets by hand (a guide entry). Anything else retries by
 * the outbox's backoff, then drops after the last attempt.
 *
 * @param row - the claimed row
 * @param error - what went wrong
 */
const failed = (row: ZammadProfileSyncDocument, error: unknown): Promise<unknown> => {
    const status = error instanceof ZammadRequestError ? error.status : undefined;
    const attempts = row.attempts + 1;

    if (status === 422 || status === 404) {
        logger.error({
            message:
                status === 422
                    ? 'zammad: the profile was not synced, the address is already another customer'
                    : 'zammad: the profile was not synced, the customer no longer exists',
            userId: String(row.userId)
        });
        return dropProfileSync(row);
    }

    if (attempts >= outboxConfig().NODE_OUTBOX_MAX_ATTEMPTS) {
        logger.error({
            message: 'zammad: the profile was not synced, out of retries',
            userId: String(row.userId)
        });
        return dropProfileSync(row);
    }

    logger.warn({ message: 'zammad: a profile sync failed', attempts, status });
    return rescheduleProfileSync(row, new Date(Date.now() + outboxBackoffMs(attempts)));
};

/**
 * Sync one claimed row from the account's current data.
 *
 * @param row - the claimed row
 */
const syncOne = (row: ZammadProfileSyncDocument): Promise<unknown> =>
    Promise.all([userService.getById(String(row.userId)), findCustomer(String(row.userId))])
        .then(([user, mapping]) =>
            // Erased or never mapped: nothing to keep current.
            user && mapping
                ? updateCustomer(mapping.zammadUserId, user.email).then(() =>
                      finishProfileSync(row)
                  )
                : dropProfileSync(row)
        )
        .catch((error: unknown) => failed(row, error));

/**
 * Claim and sync due rows, one at a time, up to `remaining`.
 *
 * @param remaining - how many more this pass may take
 * @returns how many were handled
 */
const drain = (remaining: number): Promise<number> =>
    remaining === 0
        ? Promise.resolve(0)
        : claimDueProfileSync().then((row) =>
              row
                  ? syncOne(row)
                        .then(() => drain(remaining - 1))
                        .then((handled) => handled + 1)
                  : 0
          );

/** The scheduled pass. Inert while the URL is unset. */
export const sweepProfiles = (): Promise<number> =>
    zammadEnabled() ? drain(PASS_LIMIT) : Promise.resolve(0);
