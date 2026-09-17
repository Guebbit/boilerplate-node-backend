/**
 * @module
 * Controller for `GET /antibot/challenge` — the route a self-hosted provider's widget fetches
 * work from. Vendor-hosted providers get their challenge from the vendor and never reach here.
 */

import type { Request, Response } from 'express';
import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { t } from '@infrastructure/i18n';
import type { AntibotChallenge } from '@types';

/**
 * GET /antibot/challenge (public)
 * 404 when the active provider issues nothing — `none`, or any vendor-hosted one. That is a
 * truthful answer about this deployment, not an error: there is no challenge here to fetch.
 */
export const getAntibotChallenge = (_request: Request, response: Response) =>
    Promise.resolve()
        .then(() => resolveHumanChallengeProvider())
        .then((provider) => {
            if (!provider.issueChallenge) {
                rejectResponse(response, 404, [
                    {
                        code: 'ANTIBOT_NO_CHALLENGE',
                        message: t('generic.error-antibot-no-challenge')
                    }
                ]);
                return;
            }

            return provider
                .issueChallenge()
                .then((challenge) => successResponse<AntibotChallenge>(response, challenge));
        })
        .catch(catchAs(response, 'getAntibotChallenge'));
