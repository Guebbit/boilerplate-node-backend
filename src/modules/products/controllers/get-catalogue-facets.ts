/**
 * @module
 * Public controller for the catalogue's category/tag facet counts — a thin adapter from the
 * service's `facets()` onto the standard success/error response shapes.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { productService } from '../service';
import { catchAs } from '@infrastructure/http/controller';
import type { CatalogueFacetsResponse } from '@types';

/**
 * GET /products/categories
 * Every category and tag the public catalogue carries, with counts — the storefront's filter
 * chips. Public and cached like the listing it filters; the products cache tag invalidates it
 * whenever the catalogue changes.
 */
export const getCatalogueFacets = (request: Request, response: Response) =>
    productService
        .facets()
        .then((facets) => {
            successResponse<CatalogueFacetsResponse>(response, facets);
        })
        .catch(catchAs(response, 'getCatalogueFacets'));
