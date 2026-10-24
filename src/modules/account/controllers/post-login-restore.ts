/**
 * @module
 * `POST /account/login/restore` controller — the last step of a sign-in by an account in the grace
 * of its own deletion: redeems the claim check, which cancels the deletion, then mints the session
 * exactly like `postLogin` does.
 */

import type { Request, Response } from 'express';
import { LoginRestoreBody } from '@api/schemas.zod';
import type { AuthTokens, LoginRestoreRequest } from '@types';
import { t } from '@infrastructure/i18n';
import { accountService } from '../services';
import { issueSession } from '../session/session';
import { rememberDevice } from '../session/device-cookie';
import { toRememberTier } from '../session/config';
import { recordLoginSuccess } from '../session/login-observability';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { parseBody, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import {
    readDeletionChallengeCookie,
    destroyDeletionChallengeCookie
} from '../oauth/deletion-redirect';

/**
 * POST /account/login/restore — the answer to the `{ deletionPending: true, challenge }` body of
 * `POST /account/login` (or `/login/2fa`). Omitting `challenge` is the OAuth case: its claim check
 * travels in a cookie.
 */
export const postLoginRestore = (
    request: Request<Record<string, string>, unknown, LoginRestoreRequest | undefined>,
    response: Response
) => {
    const parsed = parseBody(LoginRestoreBody, request.body ?? {}, response);
    if (!parsed) return;
    const challenge = parsed.challenge ?? readDeletionChallengeCookie(request);
    if (!challenge) {
        return rejectResponse(response, 401, [t('account.login.restore-challenge-invalid')]);
    }

    // Read before the restore: a password changed while it runs must refuse this login.
    const provedAt = Date.now();

    return accountService
        .restoreAtSignIn(challenge, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            const { user, amr } = result.data;
            const userId = user._id.toString();

            return issueSession(request, response, userId, {
                remember: toRememberTier(parsed.remember),
                amr,
                provedAt,
                transport: parsed.transport
            }).then((issued) =>
                recordLoginSuccess(request, userId).then(() => {
                    destroyDeletionChallengeCookie(response);
                    rememberDevice(request, response, user.email);
                    successResponse<AuthTokens>(
                        response,
                        issued,
                        200,
                        t('account.delete.restored')
                    );
                })
            );
        })
        .catch((error: unknown) => {
            rejectDatabaseError(response, 'postLoginRestore', error);
        });
};
