/**
 * @module
 * Ending sessions on purpose: one of the caller's own, the current one, or all of them.
 */

import { revokeFor } from './revocation';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { userService, type UserDocument } from '@modules/users';
import { hashToken } from '@infrastructure/security/hash-token';
import { sessionRepository } from '../repository';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { accountAnalyticsEvents } from '../analytics';
import { accountAuditActions } from '../audit';

/** What revoking a session did: whether anything went, and whether it was the caller's own. */
export interface SessionRevocation {
    /** A session matched and was removed. */
    revoked: boolean;
    /** The removed session is the one the caller's credential names, so its cookies are dead too. */
    current: boolean;
}

/**
 * Whether a credential names a row of the given family, by family and not by row: a `jwt` cookie
 * one rotation behind still belongs to the session.
 */
const isOwnFamily = (
    userId: string,
    familyId: string,
    credential: string | undefined
): Promise<boolean> =>
    credential
        ? sessionRepository
              .findByHash(hashToken(credential))
              .then(
                  (row) =>
                      !!row && String(row.userId) === userId && String(row.familyId) === familyId
              )
        : Promise.resolve(false);

/**
 * Revoke one of the caller's own sessions.
 *
 * `recordAudit` only when a session actually matched — `deleteSession` reports the same 404 as
 * an invented id for someone else's session or a stale one, and an audit row would misrepresent a
 * revoke that never happened.
 *
 * @param credential - what the request presented, to tell whether it revoked its own session
 */
export const sessionRevoke = (
    userId: string,
    sessionId: string,
    credential: string | undefined,
    context: CallerContext
): Promise<SessionRevocation> =>
    // Read before the delete: afterwards the credential names nothing.
    isOwnFamily(userId, sessionId, credential).then((current) =>
        sessionRepository.removeFamily(userId, sessionId).then((removed) => {
            if (removed > 0)
                recordAudit(context, {
                    action: accountAuditActions.AUTH_SESSION_REVOKED,
                    outcome: 'success'
                });
            return { revoked: removed > 0, current: removed > 0 && current };
        })
    );

/**
 * Log out of the current session only: delete the session (its whole family) the request's
 * credential names, if any, and record it either way.
 * A missing cookie isn't a failure — `postLogout` answers 200 for it either way — so the audit
 * event still fires; there's simply nothing to revoke.
 */
export const logoutCurrentSession = (
    credential: string | undefined,
    context: CallerContext
): Promise<void> =>
    (credential
        ? sessionRepository.removeFamilyByHash(hashToken(credential))
        : Promise.resolve()
    ).then(() => {
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
 * Log the account out everywhere: every session goes and the session epoch moves, so access
 * tokens already handed out die too. The caller is signed out as well, deliberately.
 * The audit row carries the real outcome, and a failed revocation is a refusal, never a 200.
 */
export const logoutEverywhere = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userService
        .findAuthenticatableById(userId)
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
                return revokeFor('logout-all', user.id).then(() =>
                    generateSuccess<UserDocument>(user)
                );
            }
        )
        .catch((error: unknown) => rejectDatabaseEnvelope('auth', error))
        .then((result) => {
            recordAudit(context, {
                action: accountAuditActions.AUTH_LOGGED_OUT_EVERYWHERE,
                outcome: result.success ? 'success' : 'failure'
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
