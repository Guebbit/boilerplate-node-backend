/**
 * @module
 * GET /inventory/movements
 * A page of the ledger, newest first, narrowed by `productId` and `reason`.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListStockMovementsQueryParams } from '@api/schemas.zod';
import { inventoryService } from '../service';
import { createListController } from '@infrastructure/surfaces/create-list-controller';

/** Handles `GET /inventory/movements`. */
export const getStockMovements = createListController({
    entity: 'stockMovements',
    schema: ListStockMovementsQueryParams.extend({
        page: pageSchema,
        pageSize: pageSizeSchema
    }).partial(),
    input: { ids: ['productId'] },
    runList: (parsed) => inventoryService.listMovements(parsed)
});
