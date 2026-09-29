/**
 * @module
 * `POST /account/signup` controller — thin HTTP adapter over `accountService.signup`. JSON only:
 * no image arrives here, because a stranger writes nothing to the store before registering.
 */

import type { Request, Response } from 'express';
import { accountService } from '../services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import type { SignupRequest, User } from '@types';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { authSignupTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { issueSession } from '../session/session';
import { sendVerificationEmail } from '../services';
import { userService } from '@modules/users';
import { SIGNUP_DEFAULT_ROLE } from '@modules/access';
import { logAntibotRefusal } from '@infrastructure/http/middlewares/antibot-log';

/**
 * POST /account/signup
 * Register a new user account.
 */
export const postSignup = (
    // `| undefined`: express 5 leaves `request.body` unset when no parser matched the
    // content-type, and multer is no protection — it calls `next()` untouched on a non-multipart
    // body. See the guard on the destructure below.
    request: Request<unknown, unknown, SignupRequest | undefined>,
    response: Response
) => {
    /*
     * Read, not parsed against `SignupBody` — deliberate, not a gap. `accountService.signup`
     * validates via `zodUserSchema`, whose messages are translated; the generated schema would
     * answer first in Zod's own English (`tests/integration/locale.test.ts` asserts it doesn't).
     */
    /*
     * Defaulted rather than passed through as `undefined`: `signup` hands these straight to
     * `zodUserSchema`, which wants strings. An
     * absent body therefore answers the same translated 422 a body of empty fields does, instead
     * of throwing — `false` for the terms because a request nobody sent accepted nothing.
     */
    const {
        email = '',
        username = '',
        password = '',
        passwordConfirm = '',
        analyticsConsent,
        termsAccepted = false
    } = request.body ?? {};

    return accountService
        .signup(
            {
                email,
                username,
                password,
                passwordConfirm,
                analyticsConsent,
                termsAccepted
            },
            callerContextOf(request)
        )
        .then((result) => {
            if (!result.success) {
                authSignupTotal.inc({ status: 'failure' });
                rejectResponse(response, result.status, result.errors);
                return;
            }

            const { data } = result;

            // `Document#isNew` stays true until `.save()`: true means rung 2 refused and NO
            // account was created. https://mongoosejs.com/docs/api/document.html#Document.prototype.isNew
            if (data.isNew) {
                // Rung 2 refused this address — `signup` still hands back an unsaved document so
                // this answers exactly like a real signup, minus the verification email.
                logAntibotRefusal('email-policy', request.method, request.path, 201);
                authSignupTotal.inc({ status: 'refused' });
                // SIGNUP_DEFAULT_ROLE, not read off a membership that was never written (this
                // document is never saved) — exactly what a genuine signup's response shows,
                // which is the whole point of this branch being indistinguishable.
                successResponse<User>(response, userService.toUser(data, SIGNUP_DEFAULT_ROLE), 201);
                return;
            }

            // Registration successful
            authSignupTotal.inc({ status: 'success' });
            /*
             * Start email verification — the account works either way (`verified` is
             * informational), so this is fire-and-forget like every other account email and the
             * 201 does not wait on the queue.
             */
            void sendVerificationEmail(data, callerContextOf(request));

            /*
             * Signed in from here, as `unverified`: the role model already lets an unproven
             * address browse freely and stops it only at `cart.self.checkout`, so a second login
             * before reaching that state would be friction with no security benefit.
             *
             * Cookies only, and the body stays `User` — the frontend's `GET /account/refresh`
             * bootstrap mints the access token, exactly as it does after the OAuth callback. That
             * also keeps rung 2's refused 201 byte-identical in the BODY; only the absence of
             * Set-Cookie distinguishes it, which is as close as indistinguishability gets once
             * signup issues a session at all. Rung 2 is off by default, and the 409 for an
             * address in use already leaks existence.
             */
            return issueSession(response, data.id).then(() => {
                // SIGNUP_DEFAULT_ROLE, not a lookup: self-service signup's `assignDefaultRole` can only
                // ever grant this one role, so it's what the membership just written holds, by
                // construction — see `authentication.ts#signup`.
                successResponse<User>(response, userService.toUser(data, SIGNUP_DEFAULT_ROLE), 201);
            });
        })
        .catch((error: unknown) => {
            authSignupTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'signup', error);
        });
};
