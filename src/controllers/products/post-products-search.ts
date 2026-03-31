import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse } from '@utils/response';
import type { SearchProductsRequest } from '@types';

/**
 * POST /products/search
 * Search products via JSON body (public; admin sees all).
 */
const postProductsSearch = (request: Request, response: Response): Promise<void> => {
    const body = request.body as SearchProductsRequest;
    const admin = request.user?.admin === true;
    return ProductService.search(body, admin).then((result) => {
        successResponse(response, result);
    });
};

export default postProductsSearch;
