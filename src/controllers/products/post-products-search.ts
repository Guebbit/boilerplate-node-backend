import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse } from '@utils/response';
import type { SearchProductsRequest } from '@types';

/**
 * POST /products/search
 * Search products via JSON body (public; admin sees all).
 */
const postProductsSearch = (request: Request<unknown, unknown, SearchProductsRequest>, response: Response): Promise<void> =>
    ProductService.search(request.body, request.user?.admin === true).then((result) => {
        successResponse(response, result);
    })

export default postProductsSearch;
