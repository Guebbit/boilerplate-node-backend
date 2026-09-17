/**
 * @module
 * `POST /account/password/check` controller — advisory only, unauthenticated (signup needs it
 * before an account exists). Never blocks anything; the four password-SET paths remain the
 * actual gate, re-checked server-side regardless of what this endpoint answers.
 */

import type { Request, Response } from 'express';
import { CheckPasswordBreachedBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import { rejectValidation } from '@infrastructure/http/controller';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { checkPasswordBreach } from '@infrastructure/security/breached-passwords';
import type { PasswordCheck } from '@types';

/** POST /account/password/check — reports a candidate password's breach status. */
export const postPasswordCheck = (request: Request, response: Response) => {
    const parseResult = CheckPasswordBreachedBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return checkPasswordBreach(parseResult.data.password)
        .then((result) => {
            successResponse<PasswordCheck>(response, result);
        })
        .catch((error: unknown) => rejectDatabaseError(response, 'postPasswordCheck', error));
};
