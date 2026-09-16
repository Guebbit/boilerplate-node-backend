/**
 * @module
 * The gate every `/webhooks` route sits behind. When `NODE_WEBHOOKS_ENABLED` is off, refuse with
 * 403 rather than 404 — the endpoints still exist in the contract, this deployment has switched
 * the feature off. Reads the flag per request the way `humanChallengeGate` does, so it captures
 * nothing at import; `config.ts` explains why "off" also stops event subscription.
 */

import type { RequestHandler } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import { isWebhooksEnabled } from './config';

/**
 * Pass through when webhooks are enabled; otherwise answer 403 with the `WEBHOOKS_DISABLED` code.
 */
export const requireWebhooksEnabled: RequestHandler = (request, response, next) => {
    if (isWebhooksEnabled()) {
        next();
        return;
    }

    rejectResponse(response, 403, [
        {
            code: 'WEBHOOKS_DISABLED',
            message: t('webhooks.feature-disabled')
        }
    ]);
};
