/**
 * @module
 * Controller for `DELETE /api-keys/:id`. Hand-written rather than built on `createDeleteController`:
 * that factory exists for the soft/hard delete triplet, and a revoke is neither — it is a state
 * change with no hard-delete counterpart.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf, extractAndValidateId } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { apiKeysService } from '../services';

/**
 * DELETE /api-keys/:id
 * Revoke a credential — a soft state change. Idempotent: revoking an already-revoked key still
 * answers 200.
 */
export const revokeApiKey = (request: Request<{ id: string }>, response: Response) => {
    // Already validated as a well-formed ObjectId here, so `revokeApiKey` below can never raise
    // the CastError a malformed one would — no not-found mapping needed on its catch.
    const id = extractAndValidateId(request, response, 'path');
    if (!id) return;

    return apiKeysService
        .revokeApiKey(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch(catchAs(response, 'revokeApiKey'));
};
