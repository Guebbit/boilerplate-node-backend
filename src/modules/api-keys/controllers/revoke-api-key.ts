/**
 * @module
 * Controller for `DELETE /api-keys/:id`. Hand-written rather than built on `createDeleteController`:
 * that factory exists for the soft/hard delete triplet, and a revoke is neither — it is a state
 * change with no hard-delete counterpart.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { apiKeysService } from '../services';

/**
 * DELETE /api-keys/:id
 * Revoke a credential — a soft state change. Idempotent: revoking an already-revoked key still
 * answers 200.
 */
export const revokeApiKey = (request: Request<{ id: string }>, response: Response) => {
    // A malformed id answers as an unknown one, before the database is asked.
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return;

    return apiKeysService
        .revokeApiKey(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch(catchAs(response, 'revokeApiKey'));
};
