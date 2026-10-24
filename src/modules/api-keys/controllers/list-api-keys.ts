/**
 * @module
 * Controller for `GET /api-keys`.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListApiKeysQueryParams } from '@api/schemas.zod';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { ApiKeysResponse } from '@types';
import { apiKeysService } from '../services';

/**
 * GET /api-keys
 * This tenant's credentials, newest first unless `sort` says otherwise. Never returns a secret.
 */
export const listApiKeys = createListController({
    entity: 'apiKeys',
    // `page`/`pageSize` swapped for the infra pair so an absent one stays absent; `sort` is split
    // on commas by `csvLists`.
    schema: ListApiKeysQueryParams.extend({ page: pageSchema, pageSize: pageSizeSchema }).partial(),
    input: { csvLists: ['sort'] },
    runList: (parsed, request): Promise<ApiKeysResponse> =>
        apiKeysService.listApiKeys(tenantCallerContextOf(request), parsed)
});
