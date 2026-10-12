/**
 * @module
 * `GET /account/sessions` controller — thin HTTP adapter over `accountService.sessionsList`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import type { SessionsResponse } from '@types';
import { accountService } from '../services';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /account/sessions — the caller's live sessions.
 * The request is handed down so the service can mark `current`; which rows count as a session, and
 * keeping credentials off the wire, belong to `../services/sessions.ts`.
 */
export const getSessions = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;

    return accountService
        .sessionsList(id, request)
        .then((sessions) => {
            successResponse<SessionsResponse>(response, { sessions });
        })
        .catch(catchAs(response, 'listSessions'));
};
