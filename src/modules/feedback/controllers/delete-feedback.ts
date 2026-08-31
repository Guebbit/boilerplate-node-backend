/**
 * @module
 * Controller for `DELETE /feedback/:id` — admin-only, permanent. Hand-written rather than built
 * on `createDeleteController`: that factory exists for the soft/hard delete triplet, and this
 * module has no soft-delete tier.
 *
 * See: docs/modules/feedback.md
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { t } from '@infrastructure/i18n';
import { callerContextOf } from '@infrastructure/http/request';
import { refused } from '@infrastructure/http/controller';
import { feedbackRequestService } from '../service';

/**
 * DELETE /feedback/:id (admin)
 * Permanently removes a feedback ticket. A malformed or unknown id both answer 404 — the same
 * status `createDeleteController` gives its own CastError, rather than the generic 422 the shared
 * database-error interpreter would otherwise answer for a bad ObjectId.
 */
export const deleteFeedback = (request: Request<{ id: string }>, response: Response) =>
    feedbackRequestService
        .remove(request.params.id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('generic.error-not-found')]);
            rejectDatabaseError(response, 'deleteFeedback', error);
        });
