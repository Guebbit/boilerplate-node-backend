import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { productRepository } from '../repository';

/**
 * GET /products/categories
 * Every category and tag the public catalogue carries, with counts — the storefront's filter
 * chips. Public and cached like the listing it filters; the products cache tag invalidates it
 * whenever the catalogue changes.
 */
export const getCatalogueFacets = (request: Request, response: Response) =>
    productRepository
        .facets()
        .then((facets) => {
            successResponse(response, facets);
        })
        .catch((error: Error) => {
            rejectDatabaseError(response, 'getCatalogueFacets', error);
        });
