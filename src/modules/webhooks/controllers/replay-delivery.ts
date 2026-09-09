/**
 * @module
 * Controller for `POST /webhooks/deliveries/:id/replay` — the single most-requested support
 * action, per `docs/modules/webhooks.md`.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { t } from '@infrastructure/i18n';
import { callerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { refused } from '@infrastructure/http/controller';
import type { WebhookDelivery } from '@types';
import { webhooksService } from '../services';

/**
 * POST /webhooks/deliveries/:id/replay
 * Re-sends the delivery synchronously, against the subscription's current url and secret ring.
 */
export const replayWebhookDelivery = (request: Request<{ id: string }>, response: Response) => {
    // 'path': this route carries no body — params-only, unlike `write`'s params-then-body.
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return webhooksService
        .replayDelivery(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            if (!result.data) throw new Error('webhook delivery replay succeeded without a result');
            return successResponse<WebhookDelivery>(
                response,
                result.data.toJSON() as WebhookDelivery
            );
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('generic.error-not-found')]);
            rejectDatabaseError(response, 'replayWebhookDelivery', error);
        });
};
