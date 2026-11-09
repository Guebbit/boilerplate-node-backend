/**
 * @module
 * `POST /account/email-change` controller — thin HTTP adapter over
 * `accountService.requestEmailChange`.
 */

import type { Request, Response } from 'express';
import { RequestEmailChangeBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { parseBody, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { accountUserService } from '@modules/users/friends/account';
import { accountService } from '../services';

/**
 * POST /account/email-change — asks to move the account to a new address. The step-up guard in
 * `routes.ts` has already run, unconditionally; the mails and the pending state are the service's.
 */
export const postEmailChange = (request: Request, response: Response) => {
    const { id, roles } = request.authContext!;

    // The contract's own body: a missing or malformed address is a 422 before anything is read.
    const parsed = parseBody(RequestEmailChangeBody, request.body, response);
    if (!parsed) return;

    return accountService
        .requestEmailChange(id, parsed.email, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, accountUserService.toAccount(result.data, roles.tenant), 200);
        })
        .catch(catchAs(response, 'postEmailChange'));
};
