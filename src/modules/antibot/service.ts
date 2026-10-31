/**
 * @module
 * The antibot module's part of `GET /config`: which human-challenge provider is active, what the
 * client needs to render its widget, and a summary of every other rung of the ladder.
 */

import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';
import { resolveEmailPolicy } from '@infrastructure/adapters/antibot';
import type { AntibotConfig } from '@types';

/**
 * This module's own route for {@link resolveHumanChallengeProvider}'s self-hosted providers to
 * hand their widget — matches `module.ts`'s `basePath` plus `routes.ts`'s `/challenge`. Named
 * here, in the module, rather than by the provider adapter itself: an adapter must not know its
 * own mount path.
 */
const CHALLENGE_URL = '/antibot/challenge';

/**
 * Door to what this module publishes.
 *
 * `config` rejects when `NODE_ANTIBOT_PROVIDER` or `NODE_ANTIBOT_EMAIL_POLICY` names something this
 * build does not have, which the caller answers as a server error. The default `none` provider
 * answers with an empty parameter map, which means "render nothing".
 */
export const antibotService = {
    config: (): Promise<AntibotConfig> =>
        Promise.resolve(resolveHumanChallengeProvider()).then((provider) => ({
            provider: provider.name,
            parameters: provider.publicParameters(CHALLENGE_URL),
            rungs: {
                identityBudgets: true,
                emailPolicy: resolveEmailPolicy()
            }
        }))
};
