import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse } from '@utils/response';
import type { SearchProductsRequest } from '../../../api/api';

/**
 * GET /products
 * List/search products via query parameters (public; admin sees all).
 */
const getProducts = async (request: Request, response: Response): Promise<void> => {
    const { id, page, pageSize, text, minPrice, maxPrice } = request.query as Record<string, string | undefined>;
    const admin = request.user?.admin === true;
    const filters: SearchProductsRequest = {
        id,
        text,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
    };
    const result = await ProductService.search(filters, admin);
    successResponse(response, result);
};

export default getProducts;
