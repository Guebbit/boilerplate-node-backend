import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type {
    SearchProductsRequest,
    CreateProductRequest,
    UpdateProductRequest,
    UpdateProductByIdRequest,
    DeleteProductRequest,
} from '@api/api';

/**
 * GET /products
 * List/search products via query parameters (public; admin sees all).
 */
export const listProducts = async (request: Request, response: Response): Promise<void> => {
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

/**
 * POST /products
 * Create a new product (admin).
 */
export const createProduct = async (request: Request, response: Response): Promise<void> => {
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

/**
 * PUT /products
 * Update a product by id in the request body (admin).
 */
export const updateProduct = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateProductRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'updateProduct - missing id', [t('generic.error-missing-data')]);
        return;
    }
    try {
        const product = await ProductService.update(body.id, body as never);
        successResponse(response, product.toObject());
    } catch (error) {
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

/**
 * DELETE /products
 * Delete a product by id in the request body (admin).
 */
export const deleteProduct = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as DeleteProductRequest;
    if (!body.id) {
        rejectResponse(response, 422, 'deleteProduct - missing id', [t('generic.error-missing-data')]);
        return;
    }
    const result = await ProductService.remove(body.id, body.hardDelete ?? false);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, undefined, 200, result.message);
};

/**
 * POST /products/search
 * Search products via JSON body (public; admin sees all).
 */
export const searchProducts = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as SearchProductsRequest;
    const admin = request.user?.admin === true;
    const result = await ProductService.search(body, admin);
    successResponse(response, result);
};

/**
 * GET /products/:id
 * Get a single product by path id (public; admin sees inactive/deleted).
 */
export const getProductById = async (request: Request, response: Response): Promise<void> => {
    const admin = request.user?.admin === true;
    const product = await ProductService.getById(String(request.params.id), admin);
    if (!product) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }
    successResponse(response, product);
};

/**
 * PUT /products/:id
 * Update a product by path id (admin).
 */
export const updateProductById = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateProductByIdRequest;
    try {
        const product = await ProductService.update(String(request.params.id), body as never);
        successResponse(response, product.toObject());
    } catch (error) {
        const message = (error as Error).message;
        if (message === '404')
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        else
            rejectResponse(response, 500, 'Internal Server Error', [message]);
    }
};

/**
 * DELETE /products/:id
 * Delete a product by path id (admin).
 */
export const deleteProductById = async (request: Request, response: Response): Promise<void> => {
    const hardDelete = request.query.hardDelete === 'true';
    const result = await ProductService.remove(String(request.params.id), hardDelete);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, undefined, 200, result.message);
};
