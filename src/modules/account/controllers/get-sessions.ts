/**
 * @module
 * `GET /account/sessions` controller — thin HTTP adapter over `accountService.sessionsList`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * GET /account/sessions — the caller's live refresh tokens, as sessions.
 * The refresh cookie is read here and passed down so the service can mark `current`; which
 * token types count as a session, and keeping token values off the wire, belong to
 * `services/tokens.ts`.
 */
export const getSessions = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);
    const cookieToken = (request.cookies as Record<string, string | undefined>).jwt;

    return accountService
        .sessionsList(id, cookieToken)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'getSessions'));
};
