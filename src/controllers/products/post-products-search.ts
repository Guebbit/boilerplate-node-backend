import type { Request, Response } from 'express';
import { productService as ProductService } from '@services/products';
import { successResponse } from '@utils/response';
import type { SearchProductsRequest } from '@types';

/**
 * POST /products/search
 * Search products via JSON body (public; admin sees all).
 */
export const postProductsSearch = (
    request: Request<unknown, unknown, SearchProductsRequest>,
    response: Response
) =>
    ProductService.search(request.body, request.user?.admin === true).then((result) => {
        successResponse(response, result);
    });

