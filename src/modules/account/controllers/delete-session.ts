/**
 * @module
 * `DELETE /account/sessions/:sessionId` controller — thin HTTP adapter over
 * `accountService.sessionRevoke`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/**
 * DELETE /account/sessions/:sessionId — revoke one of the caller's own sessions ("log out that
 * device").
 * Filtered to the caller's document and `type: refresh`, so someone else's session id, or a
 * pending reset/delete/verify token id, 404s exactly like an invented one; a malformed id 422s
 * via `toObjectId`, matching every other id-taking endpoint.
 * Revoking the CURRENT session is allowed — same effect as `POST /account/logout` minus the
 * cookie clearing, which this endpoint can't do for another client anyway.
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

            successResponse<undefined>(response, undefined, 200, t('account.sessions.revoked'));
        })
        .catch(catchAs(response, 'deleteSession'));
};
