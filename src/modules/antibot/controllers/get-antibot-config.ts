/**
 * @module
 * Controller for `GET /antibot/config` — one of this module's two routes, alongside
 * `GET /antibot/challenge` (`get-antibot-challenge.ts`).
 */

import type { Request, Response } from 'express';
import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';
import { resolveEmailPolicy } from '@infrastructure/adapters/antibot';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { AntibotConfig } from '@types';

/**
 * This module's own route for {@link resolveHumanChallengeProvider}'s self-hosted providers to
 * hand their widget — matches `module.ts`'s `basePath` plus `routes.ts`'s `/challenge`. Named
 * here, in the module, rather than by the provider adapter itself: an adapter must not know its
 * own mount path.
 */
const CHALLENGE_URL = '/antibot/challenge';

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
                parameters: provider.publicParameters(CHALLENGE_URL),
                rungs: {
                    identityBudgets: true,
                    emailPolicy: resolveEmailPolicy()
                }
            })
        )
        .catch(catchAs(response, 'getAntibotConfig'));
