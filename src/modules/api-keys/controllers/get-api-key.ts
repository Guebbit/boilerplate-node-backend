/**
 * @module
 * Controller for `GET /api-keys/:id`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import type { ApiKey } from '@types';
import { apiKeysService } from '../services';

/**
 * GET /api-keys/:id
 * One of this tenant's credentials, never its secret. A malformed id, an unknown one and another
 * tenant's all answer 404.
 */
export const getApiKey = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return Promise.resolve();

    return apiKeysService
        .getApiKey(id, tenantCallerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<ApiKey>(response, result.data, 200);
        })
        .catch(catchAs(response, 'getApiKey'));
};
