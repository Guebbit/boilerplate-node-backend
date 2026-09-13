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
 * Extends the orval-generated `SearchProductsBody` (kept in sync with openapi.yaml), coercing
 * page/pageSize/minPrice/maxPrice from strings since GET carries them as query text, not JSON
 * numbers. `page`/`pageSize` come from the shared schemas so all four search endpoints agree on
 * what's legal; absent stays absent, since `normalizePagination` owns the defaults.
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
 * Query parameters that change this endpoint's answer, and therefore its cache key. Derived from
 * the schema rather than hand-listed, so the two can't drift — a parameter the controller reads
 * but the key omits would let two different requests share one cached response.
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
