/**
 * @module
 * `GET /account/sessions/:sessionId` controller — thin HTTP adapter over `accountService.sessionGet`.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import type { Session } from '@types';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /account/sessions/:sessionId — one of the caller's own live sessions.
 * Scoped like the list: someone else's session id, a session that has ended, an invented id and a
 * malformed one all answer the same 404.
 */
export const getSession = (request: Request<{ sessionId: string }>, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const sessionId = requireId(request, response, {
        notFound: 'account.sessions.not-found',
        name: 'sessionId'
    });
    if (!sessionId) return Promise.resolve();

    return accountService
        .sessionGet(id, sessionId, request)
        .then((session) => {
            if (!session) {
                rejectResponse(response, 404, [t('account.sessions.not-found')]);
                return;
            }
            successResponse<Session>(response, session);
        })
        .catch(catchAs(response, 'getSession'));
};
