/**
 * @module
 * Controller for `POST /api-keys`.
 */

import type { Request, Response } from 'express';
import { CreateApiKeyBody } from '@api/schemas.zod';
import type { CreateApiKeyRequest, ApiKeyCreated } from '@types';
import { createdResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { apiKeysService } from '../services';

/**
 * POST /api-keys
 * Mint a credential. `permissions` must be a subset of the caller's own — the service answers 422
 * naming the offending keys when it isn't.
 */
export const mintApiKey = (
    request: Request<unknown, unknown, CreateApiKeyRequest>,
    response: Response
) => {
    const body = parseBody(CreateApiKeyBody, request.body, response);
    if (!body) return;

    return apiKeysService
        .mintApiKey(body, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            return createdResponse<ApiKeyCreated>(
                response,
                result.data,
                `/api-keys/${result.data.id}`
            );
        })
        .catch(catchAs(response, 'createApiKey'));
};
