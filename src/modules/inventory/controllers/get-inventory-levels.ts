/**
 * @module
 * GET /inventory/levels
 * A page of the stock board — both counters and availability, scarcest first.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListInventoryLevelsQueryParams } from '@api/schemas.zod';
import { inventoryService } from '../service';
import { createListController } from '@infrastructure/surfaces/create-list-controller';

/** Handles `GET /inventory/levels`. */
export const getInventoryLevels = createListController({
    entity: 'inventoryLevels',
    schema: ListInventoryLevelsQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    // `lowOnly` is a boolean the query string can only carry as text.
    input: { booleans: ['lowOnly'] },
    runList: (parsed) => inventoryService.listLevels(parsed)
});
