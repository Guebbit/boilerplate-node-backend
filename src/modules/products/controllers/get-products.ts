/**
 * @module
 * List/search controller for the catalogue — builds the query schema both `GET /products` and
 * `POST /products/search` validate against, and the cache key that schema implies, then wires
 * both onto the shared `createSearchController` factory.
 */

import { z } from 'zod';
import { coerceStringArray } from '@guebbit/js-toolkit';
import {
    SearchProductsBody,
    searchProductsBodyMinPriceMin,
    searchProductsBodyMaxPriceMin
} from '@api/schemas.zod';
import { productService } from '../service';
import { callerContextOf } from '@infrastructure/http/request';
import { pageSchema, pageSizeSchema } from '@infrastructure/http/schemas';
import { createSearchController } from '@infrastructure/surfaces/create-search-controller';

/**
 * Built on the orval-generated SearchProductsBody (kept in sync with
 * openapi.yaml); page/pageSize/minPrice/maxPrice are coerced from strings
 * since GET requests carry them as query-string text, not JSON numbers.
 *
 * `page`/`pageSize` come from `@infrastructure/http/schemas` so all four search endpoints agree on what a
 * legal one is; absent stays absent, because `normalizePagination` owns the defaults.
 */
const searchProductsQuerySchema = SearchProductsBody.extend({
    page: pageSchema,
    pageSize: pageSizeSchema,
    minPrice: z.preprocess(
        (value) => (value === '' || value === null ? undefined : value),
        z.coerce.number().min(searchProductsBodyMinPriceMin).optional()
    ),
    maxPrice: z.preprocess(
        (value) => (value === '' || value === null ? undefined : value),
        z.coerce.number().min(searchProductsBodyMaxPriceMin).optional()
    ),
    // A query string spells a boolean as text; the body carries a real one.
    active: z.preprocess(
        (value) => (typeof value === 'string' ? value === 'true' : value),
        z.boolean().optional()
    )
});

/**
 * Query parameters that change this endpoint's answer, and therefore its cache key.
 *
 * Derived from the schema rather than hand-listed, because the two must not drift: a parameter
 * the controller reads but the key omits would let two different requests share one cached
 * response. Anything outside this list is stripped by the validator and changes nothing.
 */
export const searchProductsKeyParameters = Object.keys(searchProductsQuerySchema.shape);

/**
 * GET /products
 * POST /products/search
 * List/search products via query parameters or request body.
 * Admin sees all products (including inactive/deleted); public sees only active ones.
 */
export const getProducts = createSearchController({
    entity: 'products',
    schema: searchProductsQuerySchema,
    // OpenAPI currently models category/tag as single-value filters; if arrays/CSV are provided we pick the first one.
    extendInput: (input) => ({
        category: coerceStringArray(input.category)[0],
        tag: coerceStringArray(input.tag)[0]
    }),
    runSearch: (parsed, request) =>
        productService.searchViewed(
            parsed,
            productService.callerScope(request.authContext),
            callerContextOf(request)
        )
});
