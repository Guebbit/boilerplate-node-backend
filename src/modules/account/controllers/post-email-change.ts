/**
 * @module
 * `POST /account/email-change` controller — thin HTTP adapter over
 * `accountService.requestEmailChange`.
 */

import type { Request, Response } from 'express';
import { RequestEmailChangeBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { answerAsResource } from '@infrastructure/http/preconditions';
import type { AccountView } from '@types';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { accountService } from '../services';
import { accountViewOf } from '../session/account-view';

/**
 * POST /account/email-change — asks to move the account to a new address. The step-up guard in
 * `routes.ts` has already run, unconditionally; the mails and the pending state are the service's.
 */
export const postEmailChange = (request: Request, response: Response) => {
    const authContext = request.authContext!;

    // The contract's own body: a missing or malformed address is a 422 before anything is read.
    const parsed = parseBody(RequestEmailChangeBody, request.body, response);
    if (!parsed) return;

    return accountService
        .requestEmailChange(authContext.id, parsed.email, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // Answers what `GET /account` would, with the account's new tag (RFC 9110 §8.8.3).
            answerAsResource(response, result.data, '/account');
            successResponse<AccountView>(response, accountViewOf(result.data, authContext));
        })
        .catch(catchAs(response, 'postEmailChange'));
};
