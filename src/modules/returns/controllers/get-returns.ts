/**
 * @module
 * GET /returns — a page of returns. Staff see every one; anyone else sees the returns on their
 * own orders. The scoping is the service's, decided from the caller — never from a query parameter.
 */

import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { ListReturnsQueryParams } from '@api/schemas.zod';
import { createListController } from '@infrastructure/surfaces/create-list-controller';
import { returnService } from '../services';

/** Handles `GET /returns`: newest first unless `sort` says otherwise. */
export const getReturns = createListController({
    entity: 'returns',
    // `page`/`pageSize` swapped for the infra pair so an absent one stays absent; `sort` is split
    // on commas by `csvLists`.
    schema: ListReturnsQueryParams.extend({ page: pageSchema, pageSize: pageSizeSchema }).partial(),
    input: { csvLists: ['sort'] },
    // Auth context is guaranteed by the isAuth middleware.
    runList: (parsed, request) => returnService.listReturns(parsed, request.authContext!)
});
