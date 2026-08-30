import type { Request, Response } from 'express';
import { accountService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { readUploadedImage } from '@infrastructure/adapters/image-store';
import type { SignupRequest, SignupRequestMultipart } from '@types';
import type { CastError } from 'mongoose';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { authSignupTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { sendVerificationEmail } from '../services';

/**
 * POST /account/signup
 * Register a new user account.
 */
export const postSignup = (
    request: Request<unknown, unknown, SignupRequest | SignupRequestMultipart>,
    response: Response
) => {
    /*
     * Read, not parsed against `SignupBody` — and that is deliberate rather than the gap it looks
     * like. `accountService.signup` validates every one of these fields through `zodUserSchema`,
     * whose messages come from the dictionary; the generated schema would answer first, in Zod's
     * own untranslated English, and `tests/integration/locale.test.ts` asserts it does not.
     * Whichever validator a project keeps, one endpoint must not run both.
     */
    const { email, username, password, passwordConfirm } = request.body;

    // `= ''` because `signup` passes this straight to `zodUserSchema`, which wants a string.
    const { imageUrl = '', deleteUpload } = readUploadedImage(request);

    /**
     * Register
     */
    return accountService
        .signup(email, username, password, passwordConfirm, imageUrl, callerContextOf(request))
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    authSignupTotal.inc({ status: 'failure' });
                    rejectResponse(response, result.status, result.errors);
                });

            // Registration successful
            authSignupTotal.inc({ status: 'success' });
            /*
             * Start email verification — the account works either way (`verified` is
             * informational), so this is fire-and-forget like every other account email and the
             * 201 does not wait on the queue.
             */
            if (result.data) void sendVerificationEmail(result.data, callerContextOf(request));
            // create() returns the in-memory document; the schema's toJSON transform
            // strips the hashed password before it ever reaches res.json
            successResponse(response, result.data, 201);
        })
        .catch((error: CastError | Error) => {
            authSignupTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'signup', error);
            return deleteUpload();
        });
};
