/**
 * @module
 * Soft and hard delete, restore, and the erasure cascade a hard delete runs.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { imageStore } from '@infrastructure/adapters/image-store';
import { withTransaction } from '@infrastructure/runtime/database';
import { recordAudit } from '@infrastructure/observability/audit';
import type { CallerContext } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import type { AfterErase } from '@kernel/registry';
import { revokeAllOf } from '@modules/access';
import { TokenType } from '../model';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { personalDataErasers } from '../erasure-registry';
import { usersAuditActions } from '../audit';

/**
 * Runs every registered `personalData.erase` hook (DDD-D6) and then deletes the user document
 * itself, all inside `session`'s transaction — cart cleanup, address-book erasure and the rest
 * either all happen or none do, and a crash mid-cascade no longer leaves a half-erased account.
 *
 * Sequential, not `Promise.all`: a `ClientSession` runs ONE operation at a time, and two erasers
 * racing on it fails with a confusing "sharded cluster" error that has nothing to do with
 * sharding.
 *
 * @returns the work the erasers asked to run once this commits
 */
const runErasureCascade = async (
    user: UserDocument,
    session: ClientSession
): Promise<AfterErase[]> => {
    const deferred: AfterErase[] = [];
    for (const erase of personalDataErasers()) {
        const afterErase = await erase(user.id, session);
        if (afterErase) deferred.push(afterErase);
    }
    await userRepository.deleteOne(user, session);
    return deferred;
};

/**
 * Runs the work the erasers deferred, once the transaction has committed.
 *
 * Never rejects: the account is already gone, so a failure here cannot become a failed erasure.
 * Each one is caught alone, so a failing step does not skip the ones after it; the log is the only
 * signal a human gets.
 *
 * @param userId - the erased account, for the log line
 * @param deferred - what the erasers returned
 */
const runAfterErase = (userId: string, deferred: readonly AfterErase[]): Promise<void> =>
    Promise.all(
        deferred.map((afterErase) =>
            afterErase().catch((error: unknown) => {
                // Stryker disable all
                logger.error({ message: 'Post-erasure step failed.', userId, error });
                // Stryker restore all
            })
        )
    ).then(() => undefined);

/**
 * Remove a user document (soft or hard delete). Soft delete stamps `deletedAt` once;
 * `restoreById` undoes it. A hard delete first revokes EVERY membership the account holds —
 * `revokeAllOf`, not a single tenant-scoped `revokeRole`: an account can hold a platform seat
 * alongside its tenant one, and either row surviving the user it points at is an erasure gap.
 * `revokeAllOf` stays outside the transaction below: membership lives in `access`'s own
 * collection, and DDD-D6 scoped the cascade to the six modules that hold personal data, not to
 * every write a hard delete makes. Only the hard path touches either, since a soft delete is a
 * restore waiting to happen.
 *
 * @param context - who did this. Absent for a caller with no request behind it that also has no
 * stake in the trail (a test, a script's dry run). Present and `caller.system` for the inactivity
 * reaper, which records `SYSTEM_USER_SOFT_DELETED`/`SYSTEM_USER_ERASED` rather than an `admin.*`
 * action — nobody was at the keyboard. Present and NOT `caller.system` for the admin
 * `DELETE /users(/:id)` route, which records `ADMIN_USER_SOFT_DELETED`/`ADMIN_USER_ERASED`.
 */
export const remove = (
    user: UserDocument,
    hardDelete = false,
    context?: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    if (hardDelete)
        return revokeAllOf(user.id)
            .then(() => withTransaction((session) => runErasureCascade(user, session)))
            .then((deferred) => runAfterErase(user.id, deferred))
            .then(() => imageStore.remove(user.imageUrl))
            .then(() => {
                if (context)
                    recordAudit(context, {
                        action: context.caller.system
                            ? usersAuditActions.SYSTEM_USER_ERASED
                            : usersAuditActions.ADMIN_USER_ERASED,
                        outcome: 'success',
                        target_type: 'user',
                        target_id: user.id,
                        metadata: { hardDelete: true }
                    });
            })
            .then(() => generateSuccess(undefined, 200, t('users.hard-deleted')));

    // Already deleted: nothing to do. DELETE must be safe to retry; undoing it is `restoreById`.
    if (user.deletedAt) return Promise.resolve(generateSuccess(user, 200, t('users.soft-deleted')));

    user.deletedAt = new Date();
    return userRepository.save(user).then((saved) =>
        // Soft delete revokes every refresh token too — same defense-in-depth reasoning as
        // `update`'s deactivation branch above.
        saved
            .tokenRemoveAll(TokenType.REFRESH)
            .catch(() => undefined)
            .then(() => {
                if (context)
                    recordAudit(context, {
                        action: context.caller.system
                            ? usersAuditActions.SYSTEM_USER_SOFT_DELETED
                            : usersAuditActions.ADMIN_USER_SOFT_DELETED,
                        outcome: 'success',
                        target_type: 'user',
                        target_id: user.id,
                        metadata: { hardDelete: false }
                    });
                return generateSuccess(saved, 200, t('users.soft-deleted'));
            })
    );
};

/**
 * Undo a soft delete. The account's sessions stay revoked: the owner logs in again.
 *
 * @param id - the user to restore
 * @param context - records `ADMIN_USER_RESTORED`; omit for a caller with no request behind it
 * @returns the restored user; 404 when there is none, 409 when it is not soft-deleted
 */
export const restoreById = (
    id: string,
    context?: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);
        if (!user.deletedAt) return generateReject(409, [t('users.not-deleted')]);
        user.deletedAt = undefined;
        return userRepository.save(user).then((saved) => {
            if (context)
                recordAudit(context, {
                    action: usersAuditActions.ADMIN_USER_RESTORED,
                    outcome: 'success',
                    target_type: 'user',
                    target_id: id
                });
            return generateSuccess(saved, 200, t('users.restored'));
        });
    });

/**
 * Remove a user by ID (soft or hard delete). Fetches the document then delegates to remove().
 * @param context - forwarded to {@link remove} for the audit row
 */
export const removeById = (
    id: string,
    hardDelete = false,
    context?: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    userRepository
        .findById(id)
        .then((user) =>
            user ? remove(user, hardDelete, context) : generateReject(404, [t('users.not-found')])
        );
