import { userModel as Users } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';

/**
 * Run one cleanup cycle: remove every expired token from every user document.
 */
export const runTokenCleanup = async () => {
    logger.info('Token cleanup: starting expired-token removal');
    const { status, success } = await Users.tokenRemoveExpired();
    if (success) {
        logger.info('Token cleanup: completed successfully');
    } else {
        logger.error(`Token cleanup: failed with status ${status}`);
    }
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
): Promise<{ status: number; success: boolean }> =>
    Users.tokenRemoveExpired().then((result) => {
        if (result.success)
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP,
                    outcome: 'success'
                })
            );
        return result;
    });
