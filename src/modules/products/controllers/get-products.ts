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
import { productService } from '../services';
import { callerContextOf } from '@infrastructure/http/request';
import {
    blankToUndefined,
    optionalBooleanSchema,
    pageSchema,
    pageSizeSchema
} from '@infrastructure/http/schemas';
import type { Request } from 'express';
import {
    createSearchController,
    mergedSearchInput
} from '@infrastructure/surfaces/create-search-controller';

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
        blankToUndefined,
        z.coerce.number().min(searchProductsBodyMinPriceMin).optional()
    ),
    maxPrice: z.preprocess(
        blankToUndefined,
        z.coerce.number().min(searchProductsBodyMaxPriceMin).optional()
    ),
    // A query string spells a boolean as text; the body carries a real one.
    active: optionalBooleanSchema,
    deleted: optionalBooleanSchema
});

/**
 * Query parameters that change this endpoint's answer, and therefore its cache key. Derived from
 * the schema rather than hand-listed, so the two can't drift — a parameter the controller reads
 * but the key omits would let two different requests share one cached response.
 */
export const searchProductsKeyParameters = Object.keys(searchProductsQuerySchema.shape);

/**
 * OpenAPI models category/tag as single-value filters; if arrays/CSV are provided we pick the
 * first one. Shared by the controller and the cache key, which must read the same value.
 */
const extendSearchInput = (input: Record<string, unknown>): Record<string, unknown> => ({
    category: coerceStringArray(input.category)[0],
    tag: coerceStringArray(input.tag)[0]
});

/**
 * The validated search a request asks, for the response cache's key: the same merge and the same
 * schema the controller uses, so `minPrice: "0e0"` and `minPrice: 0` are one key and a request the
 * controller would refuse never gets one.
 *
 * @param request - the incoming request
 * @returns the parsed search, or `undefined` when it does not validate (nothing to cache)
 */
export const searchProductsKeyValues = (request: Request): Record<string, unknown> | undefined => {
    const parsed = searchProductsQuerySchema.safeParse(
        mergedSearchInput(request, extendSearchInput)
    );
    return parsed.success ? parsed.data : undefined;
};

/**
 * Array parameters whose ORDER is part of the question: `sort` applies its tokens in sequence.
 * Every other array here (`id`) is a set, and the cache key sorts it.
 */
export const searchProductsOrderedParameters = ['sort'] as const;

/**
 * GET /products
 * POST /products/search
 * List/search products via query parameters or request body.
 * Admin sees all products (including inactive/deleted); public sees only active ones.
 */
export const getProducts = createSearchController({
    entity: 'products',
    schema: searchProductsQuerySchema,
    extendInput: extendSearchInput,
    runSearch: (parsed, request) =>
        productService.searchViewed(
            parsed,
            productService.callerScope(request.caller),
            callerContextOf(request)
        )
});
