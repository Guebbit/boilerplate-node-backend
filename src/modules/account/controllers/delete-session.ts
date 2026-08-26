import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

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
    const { id } = authContextOf(request);
    const { sessionId } = request.params;

    return accountService
        .sessionRevoke(id, sessionId, callerContextOf(request))
        .then(({ modifiedCount }) => {
            if (modifiedCount === 0) {
                rejectResponse(response, 404, [t('account.sessions.not-found')]);
                return;
            }

            successResponse(response, undefined, 200, t('account.sessions.revoked'));
        })
        .catch(catchAs(response, 'deleteSession'));
};
