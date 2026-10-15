/**
 * @module
 * `POST /account/email-change-confirm` controller — spends a one-time `email-change` token and
 * swaps the caller's `pendingEmail` into `email`.
 */

import type { Request, Response } from 'express';
import { ConfirmEmailChangeBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
// The request body schema is shared with `verify-confirm` — both endpoints accept `{ token }` —
// so orval names the TYPE after that shared schema rather than minting a second one.
import type { VerifyEmailConfirmRequest } from '@types';
import { authEmailChangeConfirmTotal } from '../metrics';
import { accountService } from '../services';
import { rejectValidation, refused, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/email-change-confirm — spends a one-time `email-change` token, swaps
 * `pendingEmail` into `email`. Public deliberately, like `verify-confirm`: the token in the body
 * is the credential, not a login. A `'verify'` token is refused: the two prove different
 * addresses and must not do each other's work.
 */
export const postEmailChangeConfirm = (
    request: Request<unknown, unknown, VerifyEmailConfirmRequest>,
    response: Response
) => {
    const parseResult = ConfirmEmailChangeBody.safeParse(request.body);
    if (!parseResult.success) {
        authEmailChangeConfirmTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    return accountService
        .confirmEmailChange(parseResult.data.token, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) {
                authEmailChangeConfirmTotal.inc({ status: 'failure' });
                return;
            }
            authEmailChangeConfirmTotal.inc({ status: 'success' });
            successResponse(response, undefined, result.status, result.message);
        })
        .catch((error: unknown) => {
            authEmailChangeConfirmTotal.inc({ status: 'failure' });
            // The status is DERIVED, not assumed 500: the new address being claimed by another
            // account between the request and this confirm is a real 409 (a unique-index refusal
            // on the save), not a server failure — `catchAs` is what tells the two apart, and logs
            // whichever one actually happened instead of swallowing it.
            catchAs(response, 'postEmailChangeConfirm')(error);
        });
};
