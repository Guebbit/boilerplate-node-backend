/**
 * @module
 * `POST /account/signup` controller — thin HTTP adapter over `accountService.signup`, plus the
 * uploaded-image cleanup that has to run on every path except a genuine registration: failure, and
 * the 201 rung 2 fabricates for a refused address, which the caller cannot tell apart from a real
 * one.
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
import { sendVerificationEmail, wasRefusedByEmailPolicy } from '../services';
import { toUser } from '@modules/users';
import { logAntibotRefusal } from '@infrastructure/http/middlewares/antibot-log';

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

            if (wasRefusedByEmailPolicy(data)) {
                // Rung 2 refused this address — `signup` still hands back an unsaved document so
                // this answers exactly like a real signup. No verification email, and the upload
                // is discarded same as any other refusal.
                logAntibotRefusal('email-policy', request.method, request.path, 201);
                authSignupTotal.inc({ status: 'refused' });
                return deleteUpload().then(() => {
                    successResponse<User>(response, toUser(data), 201);
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
