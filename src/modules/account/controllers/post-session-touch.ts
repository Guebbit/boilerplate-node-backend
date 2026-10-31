/**
 * @module
 * `POST /account/sessions/current/touch` controller — counts the caller's session as active and answers its
 * idle clock, so a client can show a "still there?" prompt from server numbers.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { SessionActivity } from '@types';
import { activityOf } from '../session/account-view';

/**
 * POST /account/sessions/current/touch
 * By the time this runs `getAuth` has already counted the request as activity (it is not marked
 * passive), so there is nothing to write: the answer is the clock as it now stands.
 */
export const postSessionTouch = (request: Request, response: Response) =>
    Promise.resolve()
        .then(() => {
            successResponse<SessionActivity>(response, activityOf(request.authContext!), 200);
        })
        .catch(catchAs(response, 'postSessionTouch'));
