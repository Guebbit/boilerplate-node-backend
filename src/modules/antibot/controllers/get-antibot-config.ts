/**
 * @module
 * Controller for `GET /antibot/config` — this module's only route.
 */

import type { Request, Response } from 'express';
import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';
import { resolveEmailPolicy } from '@infrastructure/adapters/antibot';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { AntibotConfig } from '@types';

/**
 * GET /antibot/config (public)
 * Tells the frontend which human-challenge provider is active and what it needs to render the
 * widget, plus a `rungs` summary of every other rung's status. The default `none` provider answers
 * with an empty parameter map, which means "render nothing". The `.catch` is what fires when
 * `NODE_ANTIBOT_PROVIDER` or `NODE_ANTIBOT_EMAIL_POLICY` names something this build does not have.
 */
export const getAntibotConfig = (_request: Request, response: Response) =>
    Promise.resolve()
        .then(() => resolveHumanChallengeProvider())
        .then((provider) =>
            successResponse<AntibotConfig>(response, {
                provider: provider.name,
                parameters: provider.publicParameters(),
                rungs: {
                    identityBudgets: true,
                    emailPolicy: resolveEmailPolicy()
                }
            })
        )
        .catch(catchAs(response, 'getAntibotConfig'));
