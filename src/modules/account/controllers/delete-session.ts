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
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { destroySessionCookie } from '../session/cookies';
import { sessionCredentialOf } from '../session/session';

/**
 * DELETE /account/sessions/:sessionId — revoke one of the caller's own sessions ("log out that
 * device").
 * Filtered to the caller's own sessions, so someone else's session id, or a pending
 * reset/delete/verify token id, 404s exactly like an invented one, and so does a malformed id.
 * Revoking the CURRENT session is allowed — same effect as `POST /account/logout`, cookies
 * cleared included. Revoking another device clears nothing: those cookies live in its browser.
 */
export const deleteSession = (request: Request<{ sessionId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const sessionId = requireId(request, response, {
        notFound: 'account.sessions.not-found',
        name: 'sessionId'
    });
    if (!sessionId) return;

    return accountService
        .sessionRevoke(id, sessionId, sessionCredentialOf(request), callerContextOf(request))
        .then(({ revoked, current }) => {
            if (!revoked) {
                rejectResponse(response, 404, [t('account.sessions.not-found')]);
                return;
            }

            if (current) {
                destroySessionCookie(response);
            }

            successResponse<undefined>(response, undefined, 200, t('account.sessions.revoked'));
        })
        .catch(catchAs(response, 'deleteSession'));
};
