/**
 * @module
 * Controller for `GET /api-keys`.
 */

import { paginationSchema } from '@infrastructure/http/schemas';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { ApiKeysResponse } from '@types';
import { apiKeysService } from '../services';

/**
 * GET /api-keys
 * This tenant's credentials, newest first. Never returns a secret.
 */
export const listApiKeys = createListController({
    entity: 'apiKeys',
    schema: paginationSchema,
    runList: (parsed, request): Promise<ApiKeysResponse> =>
        apiKeysService.listApiKeys(tenantCallerContextOf(request), parsed)
});
