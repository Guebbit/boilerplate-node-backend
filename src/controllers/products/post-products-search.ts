import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse } from '@utils/response';
import type { SearchProductsRequest } from '../../../api/api';

/**
 * POST /products/search
 * Search products via JSON body (public; admin sees all).
 */
const postProductsSearch = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as SearchProductsRequest;
    const admin = request.user?.admin === true;
    const result = await ProductService.search(body, admin);
    successResponse(response, result);
};

export default postProductsSearch;
