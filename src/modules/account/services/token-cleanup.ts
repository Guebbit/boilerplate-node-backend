/**
 * @module
 * Housekeeping for the `tokens` array: sweeping out entries that have expired.
 *
 * Two triggers, two functions. `runTokenCleanup` is a fire-and-forget pre-flight step login and
 * refresh run on every request, and must never fail the request that triggered it. `adminTokenCleanup`
 * is the deliberate admin action behind `DELETE /account/tokens/expired`, which needs an outcome to
 * answer the request with and is worth its own audit record.
 */

import { userRepository } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';

/**
 * Run one cleanup cycle: remove every expired token from every user document.
 */
export const runTokenCleanup = (): Promise<void> => {
    logger.info('Token cleanup: starting expired-token removal');
    return userRepository
        .tokenRemoveExpired()
        .then((removed) => {
            logger.info(`Token cleanup: completed, ${removed} document(s) pruned`);
        })
        .catch((error: unknown) => {
            /*
             * Contained on purpose: this runs as a pre-flight step on login and refresh, and a
             * sweep that could not run must never fail the request that triggered it.
             *
             * `error.message`, not the Error itself — the logger serializes its argument as JSON
             * and an Error has no enumerable properties, so passing the object logs `"error":{}`
             * and the operator reading this line afterwards learns nothing about why. This job
             * runs unwatched; the line IS the output.
             */
            logger.error({
                message: 'Token cleanup: failed',
                error: error instanceof Error ? error.message : String(error)
            });
        });
};

/**
 * The admin-triggered cleanup, `DELETE /account/tokens/expired`.
 *
 * Distinct from {@link runTokenCleanup}: that one is a fire-and-forget pre-flight step login and
 * refresh run on every request and reports nothing back — this one is a deliberate admin action
 * that needs the outcome to answer the request with, and is worth its own audit record.
 */
export const adminTokenCleanup = (
    context: CallerContext
): Promise<ResponseSuccess<{ removed: number }> | ResponseReject> =>
    userRepository
        .tokenRemoveExpired()
        .then((removed) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP,
                    outcome: 'success'
                })
            );
            return generateSuccess({ removed });
        })
        .catch((error: unknown) => {
            /*
             * The status is decided HERE, not two layers down. `tokenRemoveExpired` used to be a
             * schema static that resolved `{ status: 500 }` on failure and a controller replayed
             * that number into the response — a Mongoose model choosing an HTTP status. The sweep
             * now reports a count or throws, and what a failed sweep means to a client is this
             * layer's call.
             */
            logger.error({
                message: 'Admin token cleanup failed',
                error: error instanceof Error ? error.message : String(error)
            });
            return generateReject(500, []);
        });
