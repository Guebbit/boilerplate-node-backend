import type { Request, Response, NextFunction } from 'express';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /products
 * List all products with pagination
 */
export const listProducts = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const {
            page = 1,
            pageSize = 10,
            text = '',
            id,
            active
        } = request.query;

        const pageNumber = Number.parseInt(page as string, 10);
        const pageSizeNumber = Number.parseInt(pageSize as string, 10);
        const isAdmin = request.user?.admin || false;

        const result = await ProductService.search(
            text as string,
            pageNumber,
            pageSizeNumber,
            id as string,
            active === 'true' ? true : active === 'false' ? false : undefined,
            isAdmin
        );

        if (!result.success) {
            rejectResponse(response, 400, 'Failed to fetch products', result.errors);
            return;
        }

        successResponse(response, {
            data: result.data,
            meta: result.meta
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /products/:id
 * Get a single product by ID
 */
export const getProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;
        const isAdmin = request.user?.admin || false;

        const result = await ProductService.getById(id, isAdmin);

        if (!result.success || !result.data) {
            rejectResponse(response, 404, 'Product not found', result.errors);
            return;
        }

        successResponse(response, result.data);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /products
 * Create a new product (admin only)
 */
export const createProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!request.user?.admin) {
            rejectResponse(response, 403, 'Admin access required');
            return;
        }

        const productData = request.body;

        // Validate data
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
 * Update an existing product (admin only)
 */
export const updateProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!request.user?.admin) {
            rejectResponse(response, 403, 'Admin access required');
            return;
        }

        const { id } = request.params;
        const updateData = request.body;

        // Validate data
        const errors = ProductService.validateData(updateData);
        if (errors.length > 0) {
            rejectResponse(response, 422, 'Validation failed', errors);
            return;
        }

        const result = await ProductService.update(id, updateData);

        if (!result.success || !result.data) {
            rejectResponse(response, 404, 'Product not found', result.errors);
            return;
        }

        successResponse(response, result.data);
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /products/:id
 * Delete a product (admin only, soft delete by default)
 */
export const deleteProduct = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!request.user?.admin) {
            rejectResponse(response, 403, 'Admin access required');
            return;
        }

        const { id } = request.params;
        const { hardDelete = false } = request.body;

        const result = await ProductService.remove(id, hardDelete as boolean);

        if (!result.success) {
            rejectResponse(response, 404, 'Product not found', result.errors);
            return;
        }

        successResponse(response, { message: 'Product deleted successfully' });
    } catch (error) {
        next(error);
    }
};
