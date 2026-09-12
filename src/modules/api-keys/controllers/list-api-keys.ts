/**
 * @module
 * Controller for `GET /api-keys`.
 */

import { paginationSchema } from '@infrastructure/http/schemas';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { tenantCallerContextOf } from '@infrastructure/http/request';
import type { ApiKey, ApiKeysResponse } from '@types';
import { apiKeysService } from '../services';

/**
 * GET /api-keys
 * This tenant's credentials, newest first. Never returns a secret.
 */
export const listApiKeys = createListController({
    entity: 'apiKeys',
    schema: paginationSchema,
    runList: (parsed, request) =>
        apiKeysService.listApiKeys(tenantCallerContextOf(request), parsed).then((result) => {
            // `search()` returns pre-normalized (wire-shape) rows, same reasoning as every other
            // module's list controller — see `webhooks`' `listWebhookSubscriptions`.
            const items: unknown = result.items;
            return {
                items: items as ApiKey[],
                meta: result.meta
            } satisfies ApiKeysResponse;
        })
});
