/**
 * @module
 * `POST /account/signup` controller — thin HTTP adapter over `accountService.signup`, plus the
 * uploaded-image cleanup that has to run on both its success and failure paths.
 */

import type { Request, Response } from 'express';
import { accountService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { readUploadedImage } from '@infrastructure/adapters/image-store';
import type { SignupRequest, SignupRequestMultipart, User } from '@types';
import type { CastError } from 'mongoose';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { authSignupTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { sendVerificationEmail } from '../services';
import { toUser } from '@modules/users';

/**
 * POST /account/signup
 * Register a new user account.
 */
export const postSignup = (
    request: Request<unknown, unknown, SignupRequest | SignupRequestMultipart>,
    response: Response
) => {
    /*
     * Read, not parsed against `SignupBody` — deliberate, not a gap. `accountService.signup`
     * validates via `zodUserSchema`, whose messages are translated; the generated schema would
     * answer first in Zod's own English (`tests/integration/locale.test.ts` asserts it doesn't).
     */
    const { email, username, password, passwordConfirm, analyticsConsent, termsAccepted } =
        request.body;

    // `= ''` because `signup` passes this straight to `zodUserSchema`, which wants a string.
    const {
        imageUrl = '',
        thumbnailUrl,
        pendingImageKey,
        deleteUpload
    } = readUploadedImage(request);

    return accountService
        .signup(
            {
                email,
                username,
                password,
                passwordConfirm,
                analyticsConsent,
                termsAccepted,
                imageUrl,
                thumbnailUrl,
                pendingImageKey
            },
            callerContextOf(request)
        )
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    authSignupTotal.inc({ status: 'failure' });
                    rejectResponse(response, result.status, result.errors);
                });

            const { data } = result;
            if (data === undefined) {
                // A success verdict without a user is a broken service contract, not a bad request.
                authSignupTotal.inc({ status: 'failure' });
                return deleteUpload().then(() => {
                    rejectResponse(response, 500, []);
                });
            }

            // Registration successful
            authSignupTotal.inc({ status: 'success' });
            /*
             * Start email verification — the account works either way (`verified` is
             * informational), so this is fire-and-forget like every other account email and the
             * 201 does not wait on the queue.
             */
            void sendVerificationEmail(data, callerContextOf(request));
            successResponse<User>(response, toUser(data), 201);
        })
        .catch((error: CastError | Error) => {
            authSignupTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'signup', error);
            return deleteUpload();
        });
};
