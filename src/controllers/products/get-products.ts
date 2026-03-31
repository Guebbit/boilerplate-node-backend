import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse } from '@utils/response';
import type { SearchProductsRequest } from '@types';

/**
 * GET /products
 * List/search products via query parameters.
 * Admin sees all products (including inactive/deleted); public sees only active ones.
 */
const getProducts = (request: Request, response: Response): Promise<void> => {
    const { id, page, pageSize, text, minPrice, maxPrice } = request.query as Record<
        string,
        string | undefined
    >;
    // Only admin can see non-active products
    const admin = request.user?.admin === true;
    const filters: SearchProductsRequest = {
        id,
        text,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined
    };
    return ProductService.search(filters, admin).then((result) => {
        successResponse(response, result);
    });
};

export default getProducts;
