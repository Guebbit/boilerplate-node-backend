/**
 * @module
 * `POST /account/signup` controller — thin HTTP adapter over `accountService.signup`. JSON only:
 * no image arrives here, because a stranger writes nothing to the store before registering.
 */

import type { Request, Response } from 'express';
import { accountService } from '../services';
import { rejectResponse, createdResponse } from '@infrastructure/http/response';
import type { SignupRequest, User } from '@types';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { authSignupTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { issueSession } from '../session/session';
import { userService } from '@modules/users';
import { logAntibotRefusal } from '@infrastructure/http/middlewares/antibot-log';
import { AMR } from '../domain/session-proof';

/**
 * Where a signup's 201 says the new account lives. The same value for a refused address (nothing
 * was created) and a real one, so the header is no tell — and the same for everyone, since the
 * caller's own account is `/account`, never an id.
 */
const SIGNUP_LOCATION = '/account';

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
     * Read, not parsed here — deliberate, not a gap. `accountService.signup` parses it against
     * `SignupBody` plus the two rules the contract cannot say (the repeat matches, terms accepted),
     * so every caller of the service gets the same 422.
     */
    /*
     * Defaulted rather than passed through as `undefined`: `SignupInput` wants strings. An absent
     * body therefore answers the same 422 a body of empty fields does, instead of throwing —
     * `false` for the terms because a request nobody sent accepted nothing.
     */
    const {
        email = '',
        username = '',
        password = '',
        passwordConfirm = '',
        analyticsConsent,
        termsAccepted = false
    } = request.body ?? {};
    // The password this request sets is its proof. The account is new, so no epoch can predate
    // it; stated anyway, since every first session says when its proof began.
    const proof = { amr: [AMR.password], provedAt: Date.now() };

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
                // No role, exactly what a genuine signup's response shows, which is the whole
                // point of this branch being indistinguishable.
                createdResponse<User>(response, userService.toUser(data, null), SIGNUP_LOCATION);
                return;
            }

            // Registration successful
            authSignupTotal.inc({ status: 'success' });
            /*
             * Start email verification — the account works either way (`verified` is
             * informational), so this is fire-and-forget like every other account email and the
             * 201 does not wait on the queue.
             */
            void accountService.sendVerificationEmail(data, callerContextOf(request));

            /*
             * Signed in from here, as an `unverified` audience: the role model already lets an unproven
             * address browse freely and stops it only at `checkout:Cart`, so a second login
             * before reaching that state would be friction with no security benefit.
             *
             * Cookies only, and the body stays `User` — the frontend's `POST /account/refresh`
             * bootstrap mints the access token, exactly as it does after the OAuth callback. That
             * also keeps rung 2's refused 201 byte-identical in the BODY; only the absence of
             * Set-Cookie distinguishes it, which is as close as indistinguishability gets once
             * signup issues a session at all. Rung 2 is off by default, and the 409 for an
             * address in use already leaks existence.
             */
            return issueSession(request, response, data.id, proof).then(() => {
                // Self-service signup grants no role, so there is none to look up.
                createdResponse<User>(response, userService.toUser(data, null), SIGNUP_LOCATION);
            });
        })
        .catch((error: unknown) => {
            authSignupTotal.inc({ status: 'failure' });
            rejectDatabaseError(response, 'signup', error);
        });
};
