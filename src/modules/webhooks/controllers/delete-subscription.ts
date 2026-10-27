/**
 * @module
 * Controller for `DELETE /webhooks/subscriptions/:id`. Hand-written rather than built on
 * `createDeleteController`: that factory exists for the soft/hard delete triplet, and this module
 * has only a permanent delete.
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { webhooksService } from '../services';

/**
 * DELETE /webhooks/subscriptions/:id
 * Permanently removes the subscription. Its delivery log is left in place.
 */
export const deleteWebhookSubscription = (request: Request<{ id: string }>, response: Response) => {
    // A malformed id answers as an unknown one, before the database is asked.
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return;

    return webhooksService
        .removeSubscription(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            noContentResponse(response);
        })
        .catch(catchAs(response, 'deleteWebhookSubscription'));
};
