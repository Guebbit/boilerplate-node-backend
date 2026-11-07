/**
 * @module
 * `GET /config` — what a client reads before it has a session, in one answer: the session config
 * (`account`), the OAuth providers (`account`), the human-challenge config (`antibot`), the
 * support address every "write to us" line shows (`NODE_SUPPORT_EMAIL`), and who runs the site and
 * which Terms are in force (`account`).
 *
 * Here, not in a module: the answer belongs to neither piece's owner, so each module keeps its own
 * part and this composes them. `GET /shop` stays its own call, because the shop is removable and
 * this answer must exist without it,
 * which is why the operator's legal identity is here and not on `/shop`.
 */

import { Router } from 'express';
import { accountService, operatorIdentity, termsVersion } from '@modules/account';
import { antibotService } from '@modules/antibot';
import { supportEmail } from '@infrastructure/adapters/config';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { Config } from '@types';

/** This file's router, mounted at `/` by `app/routes.ts`. */
export const router = Router();

/**
 * How long a client or proxy may reuse the answer. Every piece is read from the environment at
 * boot, so nothing in it is live per request; a minute is short enough that a restart shows soon.
 */
const CACHE_CONTROL = 'public, max-age=60';

/**
 * GET /config (public). The `.catch` fires when `NODE_ANTIBOT_PROVIDER` or
 * `NODE_ANTIBOT_EMAIL_POLICY` names something this build does not have.
 */
router.get('/config', (_request, response) => {
    return antibotService
        .config()
        .then((antibot) => {
            // Success only, and overwriting the app-wide `no-store` default as the sitemap does:
            // a refusal must never be kept by a cache.
            response.setHeader('Cache-Control', CACHE_CONTROL);
            successResponse<Config>(response, {
                session: accountService.sessionConfig(),
                oauthProviders: accountService.oauthProviders(),
                antibot,
                supportEmail: supportEmail(),
                operator: operatorIdentity(),
                termsVersion: termsVersion()
            });
        })
        .catch(catchAs(response, 'getConfig'));
});
