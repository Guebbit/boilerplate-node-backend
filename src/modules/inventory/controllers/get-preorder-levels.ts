/**
 * @module
 * GET /inventory/preorders
 * A page of the preorder board — each product's allowance, what is outstanding against it and how
 * that splits between paid and unpaid orders.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListPreorderLevelsQueryParams } from '@api/schemas.zod';
import { inventoryService } from '../services';
import { createListController } from '@infrastructure/surfaces/create-list-controller';

/** Handles `GET /inventory/preorders`. */
export const getPreorderLevels = createListController({
    entity: 'preorderLevels',
    schema: ListPreorderLevelsQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    runList: (parsed) => inventoryService.listPreorders(parsed)
});
