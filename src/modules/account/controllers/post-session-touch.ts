/**
 * @module
 * `POST /account/session/touch` controller — counts the caller's session as active and answers its
 * idle clock, so a client can show a "still there?" prompt from server numbers.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { t } from '@infrastructure/i18n';
import type { SessionActivity } from '@types';
import { idleLimitMilliseconds } from '../session/idle';

/**
 * POST /account/session/touch
 * By the time this runs `getAuth` has already counted the request as activity (it is not marked
 * passive), so there is nothing to write: the answer is the clock as it now stands.
 */
export const postSessionTouch = (request: Request, response: Response) =>
    Promise.resolve()
        .then(() => {
            const limitMilliseconds = idleLimitMilliseconds(request.authContext!.roles);
            successResponse<SessionActivity>(
                response,
                {
                    lastActiveAt: new Date().toISOString(),
                    ...(limitMilliseconds > 0 && { idleTimeoutSeconds: limitMilliseconds / 1000 })
                },
                200,
                t('account.session-touched')
            );
        })
        .catch(catchAs(response, 'postSessionTouch'));
