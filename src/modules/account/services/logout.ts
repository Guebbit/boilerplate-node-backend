/**
 * @module
 * Ending sessions on purpose: one of the caller's own, the current one, or all of them.
 */

import { revokeAllSessionsAnnounced } from './revocation';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { userService, type UserDocument } from '@modules/users';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';

/**
 * Revoke one of the caller's own sessions.
 *
 * `recordAudit` only when a token actually matched — `deleteSession` reports the same 404 as
 * an invented id for someone else's session or a stale one, and an audit row would misrepresent a
 * revoke that never happened.
 */
export const sessionRevoke = (
    userId: string,
    sessionId: string,
    context: CallerContext
): Promise<{ modifiedCount: number }> =>
    userService.sessionRemove(userId, sessionId).then((result) => {
        if (result.modifiedCount > 0)
            recordAudit(context, {
                action: accountAuditActions.AUTH_SESSION_REVOKED,
                outcome: 'success'
            });
        return result;
    });

/**
 * Log out of the current session only: revoke the refresh token the caller's cookie names, if
 * any, and record it either way.
 * A missing cookie isn't a failure — `postLogout` answers 200 for it either way — so the audit
 * event still fires; there's simply nothing to revoke.
 */
export const logoutCurrentSession = (
    refreshToken: string | undefined,
    context: CallerContext
): Promise<void> =>
    (refreshToken ? userService.tokenRemoveByValue(refreshToken) : Promise.resolve()).then(() => {
        recordAudit(context, {
            action: accountAuditActions.AUTH_LOGGED_OUT,
            outcome: 'success'
        });
        /*
         * This route authenticates by cookie alone, so there is no bearer to resolve and
         * `distinctId` falls back to 'anonymous'. Under Umami the visitor is still separated
         * by the IP + user-agent hash; under PostHog these rows do not attribute to a person.
         */
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            event: accountAnalyticsEvents.USER_LOGGED_OUT,
            properties: { scope: 'session' }
        });
    });

/**
 * Log the account out everywhere: every refresh token goes and the session epoch moves, so access
 * tokens already handed out die too. The caller is signed out as well, deliberately.
 * The audit emit fires unconditionally: the caller's next step is "clear cookies, answer
 * success" either way, so it was never actually gated on `result.success` — this preserves
 * that rather than introducing a new condition.
 */
export const logoutEverywhere = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userService
        // `tokens` is select:false — needed here to filter and re-save them
        .findByIdWithCredentials(userId)
        .then(
            (
                user
            ):
                | ResponseSuccess<UserDocument>
                | ResponseReject
                | Promise<ResponseSuccess<UserDocument>> => {
                // Gone-but-verified is 401 here too — `openapi.yaml` declares no 404 for
                // `logoutAll`, and the caller's session is exactly what no longer exists.
                if (!user) return generateReject(401, []);
                // `$pull` rather than filter-and-save: `user.tokens = user.tokens.filter(...)`
                // rebuilds the array, writing it back whole and erasing anything added between
                // this function's read and write. That race window is hard to assert in a test —
                // `$pull` describes a change instead, closing it in the implementation.
                return revokeAllSessionsAnnounced(user, 'logout-all').then(() =>
                    generateSuccess<UserDocument>(user)
                );
            }
        )
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error))
        .then((result) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_LOGGED_OUT_EVERYWHERE,
                outcome: 'success'
            });
            // Same name as the single-session logout, told apart by `scope`: one funnel counts
            // logouts, and splitting it across two names would make every rate built on it wrong.
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: accountAnalyticsEvents.USER_LOGGED_OUT,
                properties: { scope: 'everywhere' }
            });
            return result;
        });
