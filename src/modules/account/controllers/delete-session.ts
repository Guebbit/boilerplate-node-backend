import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { userRepository } from '@modules/users';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';

/**
 * DELETE /account/sessions/:sessionId
 * Revoke one of the caller's own sessions — "log out that device".
 *
 * The repository pins the filter to the caller's document and to `type: refresh`, so a session
 * id that belongs to someone else, or the id of a pending reset/delete/verify token, matches
 * nothing and answers the same 404 as an invented id. A malformed id is a 422 — `toObjectId`
 * throws and the catch below maps it — keeping the split every other id-taking endpoint has.
 *
 * Revoking the CURRENT session is allowed: it is `POST /account/logout` minus the cookie
 * clearing, which this endpoint cannot do for another client anyway — its next refresh simply
 * fails.
 */
export const deleteSession = (request: Request<{ sessionId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const { sessionId } = request.params;

    return userRepository
        .sessionRemove(id, sessionId)
        .then(({ modifiedCount }) => {
            if (modifiedCount === 0) {
                rejectResponse(response, 404, [t('account.sessions.not-found')]);
                return;
            }

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: accountAuditActions.AUTH_SESSION_REVOKED,
                    outcome: 'success'
                })
            );

            successResponse(response, undefined, 200, t('account.sessions.revoked'));
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'deleteSession', error);
        });
};
