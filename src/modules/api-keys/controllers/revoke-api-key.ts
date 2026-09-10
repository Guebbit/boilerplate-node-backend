/**
 * @module
 * Controller for `DELETE /api-keys/:id`. Hand-written rather than built on `createDeleteController`:
 * that factory exists for the soft/hard delete triplet, and a revoke is neither — it is a state
 * change with no hard-delete counterpart.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { t } from '@infrastructure/i18n';
import { callerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { refused } from '@infrastructure/http/controller';
import { apiKeysService } from '../services';

/**
 * DELETE /api-keys/:id
 * Revoke a credential — a soft state change. Idempotent: revoking an already-revoked key still
 * answers 200.
 */
export const revokeApiKey = (request: Request<{ id: string }>, response: Response) => {
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return apiKeysService
        .revokeApiKey(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('generic.error-not-found')]);
            rejectDatabaseError(response, 'revokeApiKey', error);
        });
};
