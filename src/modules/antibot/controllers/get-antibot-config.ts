/**
 * @module
 * Controller for `GET /antibot/config` — this module's only route.
 */

import type { Request, Response } from 'express';
import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { AntibotConfig } from '@types';

/**
 * GET /antibot/config (public)
 * Tells the frontend which provider is active and what it needs to render the widget. The default
 * `none` answers with an empty parameter map, which means "render nothing". The `.catch` is what
 * fires when `NODE_ANTIBOT_PROVIDER` names an implementation this build does not have.
 */
export const getAntibotConfig = (_request: Request, response: Response) =>
    Promise.resolve()
        .then(() => resolveHumanChallengeProvider())
        .then((provider) =>
            successResponse<AntibotConfig>(response, {
                provider: provider.name,
                parameters: provider.publicParameters()
            })
        )
        .catch(catchAs(response, 'getAntibotConfig'));
