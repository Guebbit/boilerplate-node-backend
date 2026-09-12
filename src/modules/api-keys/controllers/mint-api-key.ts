/**
 * @module
 * Controller for `POST /api-keys`.
 */

import type { Request, Response } from 'express';
import { MintApiKeyBody } from '@api/schemas.zod';
import type { MintApiKeyRequest, ApiKeyCreated } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { apiKeysService } from '../services';

/**
 * POST /api-keys
 * Mint a credential. `permissions` must be a subset of the caller's own — the service answers 422
 * naming the offending keys when it isn't.
 */
export const mintApiKey = (
    request: Request<unknown, unknown, MintApiKeyRequest>,
    response: Response
) => {
    const body = parseBody(MintApiKeyBody, request.body, response);
    if (!body) return;

    return apiKeysService
        .mintApiKey(body, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            // `refused` only reports the reject branch; a success result always carries the
            // minted credential.
            if (!result.data) throw new Error('api key minted without a result');
            return successResponse<ApiKeyCreated>(response, result.data, 201);
        })
        .catch(catchAs(response, 'mintApiKey'));
};
