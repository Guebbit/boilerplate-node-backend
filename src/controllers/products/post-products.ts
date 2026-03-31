import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-files';
import { deleteFile } from '@utils/helpers-filesystem';
import type { CreateProductRequest, CreateProductRequestMultipart } from '@types';

/**
 * POST /products
 * Create a new product (admin).
 */
const postProducts = async (request: Request<unknown, unknown, CreateProductRequest | CreateProductRequestMultipart>, response: Response): Promise<void> => {
    const body = request.body as CreateProductRequest;
    const imageUrlBody = body.imageUrl;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);

    const resolvedImageUrl = imageUrl ?? imageUrlBody;
    const errors = ProductService.validateData({ ...body, ...(resolvedImageUrl !== undefined && { imageUrl: resolvedImageUrl }) } as never);
    if (errors.length > 0) {
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        rejectResponse(response, 422, 'createProduct - validation failed', errors);
        return;
    }
    try {
        const product = await ProductService.create({ ...body, ...(resolvedImageUrl !== undefined && { imageUrl: resolvedImageUrl }) } as never);
        successResponse(response, product.toObject(), 201);
    } catch (error) {
        if (imageUrlRaw)
            await deleteFile(imageUrlRaw);
        rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message]);
    }
};

export default postProducts;
