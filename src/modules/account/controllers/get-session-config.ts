/**
 * @module
 * `GET /account/session-config` controller — which session mode this deployment runs.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { SessionConfig } from '@types';
import {
    getExpiryTime,
    getSessionMode,
    getStaffLifetimeSeconds,
    RefreshTokenExpiryTime
} from '../session/config';

/**
 * GET /account/session-config (public)
 * Tells a client how this deployment keeps people signed in and for how long, so it can adapt at boot instead of
 * carrying a switch of its own. The `.catch` is what fires when the configuration is unreadable.
 */
export const getSessionConfig = (_request: Request, response: Response) =>
    Promise.resolve()
        .then(() => {
            const staffLifetimeSeconds = getStaffLifetimeSeconds();
            successResponse<SessionConfig>(response, {
                mode: getSessionMode(),
                lifetimeSeconds: {
                    short: getExpiryTime(RefreshTokenExpiryTime.SHORT),
                    medium: getExpiryTime(RefreshTokenExpiryTime.MEDIUM),
                    long: getExpiryTime(RefreshTokenExpiryTime.LONG)
                },
                // 0 switches the cap off: nothing to state.
                ...(staffLifetimeSeconds > 0 && { staffLifetimeSeconds })
            });
        })
        .catch(catchAs(response, 'getSessionConfig'));
