import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { CreateProductRequest } from '@api/api';

/**
 * POST /products
 * Create a new product (admin).
 */
const postProducts = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as CreateProductRequest;
    const errors = ProductService.validateData(body as never);
    if (errors.length > 0) {
        rejectResponse(response, 422, 'createProduct - validation failed', errors);
        return;
    }
    try {
        const product = await ProductService.create(body as never);
        successResponse(response, product.toObject(), 201);
    } catch (error) {
        rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message]);
    }
};

export default postProducts;
