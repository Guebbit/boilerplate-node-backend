import type { Request, Response, NextFunction } from 'express';
import type { SearchProductsRequest } from '@api/api';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /products
 * List all products with optional filters and pagination.
 */
export const listProducts = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const {
            page,
            pageSize,
            text,
            id,
            minPrice,
            maxPrice,
        } = request.query;

        const isAdmin = request.user?.admin ?? false;

        const filters: SearchProductsRequest = {
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            text: text as string | undefined,
            id: id as string | undefined,
            minPrice: minPrice ? Number(minPrice) : undefined,
            maxPrice: maxPrice ? Number(maxPrice) : undefined,
        };

        const result = await ProductService.search(filters, isAdmin);

        successResponse(response, result);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /products/:id
 * Get a single product by ID.
 */
export const getProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;
        const isAdmin = request.user?.admin ?? false;

        const product = await ProductService.getById(id as string, isAdmin);

        if (!product) {
            rejectResponse(response, 404, 'Product not found');
            return;
        }

        successResponse(response, product);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /products
 * Create a new product (admin only).
 */
export const createProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const productData = request.body;

        const errors = ProductService.validateData(productData);
        if (errors.length > 0) {
            rejectResponse(response, 422, 'Validation failed', errors);
            return;
        }

        const product = await ProductService.create(productData);

        successResponse(response, product, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /products/:id
 * Update an existing product (admin only).
 */
export const updateProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;
        const updateData = request.body;

        const errors = ProductService.validateData(updateData);
        if (errors.length > 0) {
            rejectResponse(response, 422, 'Validation failed', errors);
            return;
        }

        const product = await ProductService.update(id as string, updateData);

        successResponse(response, product);
    } catch (error) {
        if (error instanceof Error && error.message === '404') {
            rejectResponse(response, 404, 'Product not found');
            return;
        }
        next(error);
    }
};

/**
 * DELETE /products/:id
 * Delete a product (admin only, soft delete by default).
 */
export const deleteProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;
        const { hardDelete = false } = request.body as { hardDelete?: boolean };

        const result = await ProductService.remove(id as string, hardDelete);

        if (!result.success) {
            rejectResponse(response, 404, 'Product not found', result.errors);
            return;
        }

        successResponse(response, { message: 'Product deleted successfully' });
    } catch (error) {
        next(error);
    }
};

