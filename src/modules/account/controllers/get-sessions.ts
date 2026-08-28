import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { authContextOf } from '@infrastructure/http/request';

/**
 * GET /account/sessions
 * List the authenticated user's live refresh tokens as sessions.
 *
 * The refresh cookie is read here and passed down because it is the one input only the controller
 * can see: `current` means "the session this very request authenticated with", which is a fact
 * about the request rather than about the account. Which token types count as a session, and the
 * rule that a token value never reaches the wire, belong to `services/tokens.ts`.
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
