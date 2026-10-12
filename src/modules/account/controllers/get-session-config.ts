/**
 * @module
 * `GET /account/session-config` controller — which session mode this deployment runs.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { SessionConfig } from '@types';
import { getSessionMode } from '../session/config';

/**
 * GET /account/session-config (public)
 * Tells a client how this deployment keeps people signed in, so it can adapt at boot instead of
 * carrying a switch of its own. The `.catch` is what fires when the configuration is unreadable.
 */
export const getSessionConfig = (_request: Request, response: Response) =>
    Promise.resolve()
        .then(() => {
            successResponse<SessionConfig>(response, { mode: getSessionMode() });
        })
        .catch(catchAs(response, 'getSessionConfig'));
