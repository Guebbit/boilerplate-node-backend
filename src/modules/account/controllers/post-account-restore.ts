/**
 * @module
 * `POST /account/restore` controller — spends the mailed restore link and cancels the scheduled
 * deletion. Public: the token is the credential. It signs nobody in.
 */

import type { Request, Response } from 'express';
import { RestoreAccountBody } from '@api/schemas.zod';
import { accountService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { AccountRestoreRequest } from '@types';
import { parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/restore
 * Validate the one-time restore token and cancel the account's scheduled deletion.
 */
export const postAccountRestore = (
    request: Request<unknown, unknown, AccountRestoreRequest>,
    response: Response
) => {
    const body = parseBody(RestoreAccountBody, request.body, response);
    if (!body) return;

    return accountService
        .restoreAccountByLink(body.token, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            successResponse<undefined>(response, undefined, result.status, result.message);
        })
        .catch((error: unknown) => {
            // Same interpreter every other write path answers through.
            rejectDatabaseError(response, 'postAccountRestore', error);
        });
};
