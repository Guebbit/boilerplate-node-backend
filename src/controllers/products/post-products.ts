import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { CreateProductRequest } from '../../../api/api';

/**
 * POST /products
 * Create a new product (admin).
 */
const postProducts = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as CreateProductRequest;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request);

    const errors = ProductService.validateData({ ...body, ...(imageUrl !== undefined && { imageUrl }) } as never);
    if (errors.length > 0) {
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        rejectResponse(response, 422, 'createProduct - validation failed', errors);
        return;
    }
    try {
        const product = await ProductService.create({ ...body, ...(imageUrl !== undefined && { imageUrl }) } as never);
        successResponse(response, product.toObject(), 201);
    } catch (error) {
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message]);
    }
};

export default postProducts;
