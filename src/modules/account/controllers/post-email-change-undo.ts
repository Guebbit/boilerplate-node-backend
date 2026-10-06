/**
 * @module
 * `POST /account/email-change-undo` controller — spends the one-time undo link mailed to the OLD
 * address and puts the account back as it was.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { ConfirmEmailChangeBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
// Both token endpoints take `{ token }`, so orval names the TYPE after the shared schema.
import type { VerifyEmailConfirmRequest } from '@types';
import { authEmailChangeUndoTotal } from '../metrics';
import { accountService, EMAIL_CHANGE_UNDO_TOKEN_TYPE } from '../services';
import { rejectValidation, catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/email-change-undo — spends an `email-change-undo` token and reverts the change.
 * Public, like `email-change-confirm`: the token in the body is the credential. Find then spend
 * for the race, as every token confirm does (`services/tokens.ts`); a confirmation or verify token
 * never matches this type, so the links cannot do each other's work.
 */
export const postEmailChangeUndo = (
    request: Request<unknown, unknown, VerifyEmailConfirmRequest>,
    response: Response
) => {
    // Same `{ token }` body as the confirm endpoint, so its schema is the one that applies.
    const parseResult = ConfirmEmailChangeBody.safeParse(request.body);
    if (!parseResult.success) {
        authEmailChangeUndoTotal.inc({ status: 'failure' });
        return rejectValidation(response, parseResult.error);
    }

    return accountService
        .redeemLiveToken(EMAIL_CHANGE_UNDO_TOKEN_TYPE, parseResult.data.token)
        .then((user) => {
            if (!user) {
                authEmailChangeUndoTotal.inc({ status: 'failure' });
                rejectResponse(response, 422, [t('account.email-change.token-not-found')]);
                return;
            }

            return accountService.undoEmailChange(user, callerContextOf(request)).then(() => {
                authEmailChangeUndoTotal.inc({ status: 'success' });
                successResponse(response, undefined, 200, t('account.email-change.undone'));
            });
        })
        .catch((error: unknown) => {
            authEmailChangeUndoTotal.inc({ status: 'failure' });
            // A 409 is real here: the previous address may have been claimed meanwhile.
            catchAs(response, 'postEmailChangeUndo')(error);
        });
};
