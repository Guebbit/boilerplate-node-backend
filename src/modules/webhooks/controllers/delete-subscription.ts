/**
 * @module
 * Controller for `DELETE /webhooks/subscriptions/:id`. Hand-written rather than built on
 * `createDeleteController`: that factory exists for the soft/hard delete triplet, and this module
 * has only a permanent delete.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { t } from '@infrastructure/i18n';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/**
 * DELETE /webhooks/subscriptions/:id
 * Permanently removes the subscription. Its delivery log is left in place.
 */
export const deleteWebhookSubscription = (request: Request<{ id: string }>, response: Response) => {
    // 'path': this route carries no body — params-only, unlike `write`'s params-then-body.
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return webhooksService
        .removeSubscription(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('generic.error-not-found')]);
            rejectDatabaseError(response, 'deleteWebhookSubscription', error);
        });
};
