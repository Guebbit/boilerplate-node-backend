/**
 * @module
 * `GET /account/session-config` controller — which session mode this deployment runs.
 */

import { RememberTier } from '@types';
import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { SessionConfig } from '@types';
import { getExpiryTime, getSessionMode, getStaffLifetimeSeconds } from '../session/config';

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
                    short: getExpiryTime(RememberTier.short),
                    medium: getExpiryTime(RememberTier.medium),
                    long: getExpiryTime(RememberTier.long)
                },
                // 0 switches the cap off: nothing to state.
                ...(staffLifetimeSeconds > 0 && { staffLifetimeSeconds })
            });
        })
        .catch(catchAs(response, 'getSessionConfig'));
