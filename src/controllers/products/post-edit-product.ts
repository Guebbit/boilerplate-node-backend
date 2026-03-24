import type { NextFunction, Request, Response } from "express";
import type { CastError } from "mongoose";
import { ExtendedError } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { CreateProductRequest, UpdateProductRequest, UpdateProductByIdRequest } from "@api/api";
import ProductService from "@services/products";

/**
 * Path parameters for product-by-id endpoints
 */
export interface IProductIdParams {
    id: string;
}

/**
 * Create a new product (admin only).
 * POST /products
 *
 * @param request
 * @param response
 * @param next
 */
export const postCreateProduct = async (request: Request<unknown, unknown, CreateProductRequest>, response: Response, next: NextFunction) => {
    const {
        title,
        description = "",
        active = false,
    } = request.body;
    const price = Number(request.body.price);
    const imageUrl = (request.body as unknown as { imageUrl?: string }).imageUrl ?? "";

    /**
     * Data validation
     */
    const issues = ProductService.validateData({
        title,
        imageUrl,
        price,
        description,
        active,
    });

    if (issues.length > 0)
        return rejectResponse(response, 422, 'product - validation error', issues);

    return ProductService.create({
        title,
        imageUrl,
        price,
        description,
        active,
    })
        .then((product) => successResponse(response, product.toObject(), 201))
        .catch((error: CastError) => next(new ExtendedError(error.kind, 500, false, [ error.message ])));
};

/**
 * Update an existing product (admin only) — ID provided in request body.
 * PUT /products
 *
 * @param request
 * @param response
 * @param next
 */
export const putEditProduct = async (request: Request<unknown, unknown, UpdateProductRequest>, response: Response, next: NextFunction) => {
    const { id } = request.body;

    if (!id || id === '')
        return rejectResponse(response, 422, 'product - missing id', ['Product id is required']);

    return _updateProduct(id, request.body, response, next);
};

/**
 * Update an existing product (admin only) — ID provided as path parameter.
 * PUT /products/:id
 *
 * @param request
 * @param response
 * @param next
 */
export const putEditProductById = async (request: Request<IProductIdParams, unknown, UpdateProductByIdRequest>, response: Response, next: NextFunction) =>
    _updateProduct(request.params.id, request.body, response, next);

/**
 * Shared product update logic
 */
const _updateProduct = async (
    id: string,
    data: Partial<UpdateProductRequest>,
    response: Response,
    next: NextFunction,
) => {
    const {
        title,
        description,
        active,
        imageUrl = "",
    } = data;
    const price = data.price !== undefined ? Number(data.price) : undefined;

    return ProductService.update(id, {
        ...(title !== undefined && { title }),
        ...(price !== undefined && { price }),
        ...(description !== undefined && { description }),
        ...(active !== undefined && { active }),
    }, imageUrl)
        .then((updatedProduct) => successResponse(response, updatedProduct.toObject()))
        .catch((error: CastError) => {
            if (error.message === '404')
                return rejectResponse(response, 404, 'product - not found', ['Product not found']);
            return next(new ExtendedError(error.kind, 500, false, [ error.message ]));
        });
};