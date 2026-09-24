/**
 * @module
 * Controller for `DELETE /webhooks/subscriptions/:id`. Hand-written rather than built on
 * `createDeleteController`: that factory exists for the soft/hard delete triplet, and this module
 * has only a permanent delete.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/**
 * DELETE /webhooks/subscriptions/:id
 * Permanently removes the subscription. Its delivery log is left in place.
 */
export const deleteWebhookSubscription = (request: Request<{ id: string }>, response: Response) => {
    // 'path': this route carries no body — params-only, unlike `write`'s params-then-body.
    // Already validated as a well-formed ObjectId here, so `removeSubscription` below can never
    // raise the CastError a malformed one would — no not-found mapping needed on its catch.
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return webhooksService
        .removeSubscription(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch(catchAs(response, 'deleteWebhookSubscription'));
};
