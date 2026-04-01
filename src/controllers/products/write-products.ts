import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import type {
    CreateProductRequest,
    CreateProductRequestMultipart,
    UpdateProductRequest,
    UpdateProductRequestMultipart,
    UpdateProductByIdRequest,
    UpdateProductByIdRequestMultipart
} from '@types';

/**
 * POST /products — create a new product (admin).
 * PUT /products — update a product by id in the request body (admin).
 * PUT /products/:id — update a product by path id (admin).
 *
 * Behaviour: if an id is found (path param or body), the product is updated;
 * otherwise a new product is created (POST only — PUT without id returns 422).
 */
export const writeProducts = (
    request: Request<
        { id?: string },
        unknown,
        | CreateProductRequest
        | CreateProductRequestMultipart
        | UpdateProductRequest
        | UpdateProductRequestMultipart
        | UpdateProductByIdRequest
        | UpdateProductByIdRequestMultipart
    >,
    response: Response
) => {
    const id = request.params.id ?? (request.body as { id?: string }).id;

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const { imageUrlRaw, imageUrl } = resolveImageUrl(request as Request);
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve());

    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, 'updateProduct - missing id', [
                t('generic.error-missing-data')
            ]);
            return deleteUpload();
        }

        // POST: create
        const errors = productService.validateData({
            ...request.body,
            imageUrl: imageUrl ?? request.body.imageUrl
        });
        if (errors.length > 0)
            return deleteUpload().then(() => {
                rejectResponse(response, 422, 'createProduct - validation failed', errors);
            });

        return productService
            .create({ ...request.body, imageUrl: imageUrl ?? request.body.imageUrl })
            .then((product) => {
                successResponse(response, product.toObject(), 201);
            })
            .catch((error: Error) =>
                deleteUpload().then(() => {
                    rejectResponse(response, 500, 'Internal Server Error', [error.message]);
                })
            );
    }

    // PUT or POST with id: update
    return productService
        .update(id, { ...request.body, imageUrl: imageUrl ?? request.body.imageUrl })
        .then((product) => {
            successResponse(response, product.toObject());
        })
        .catch((error: Error) =>
            deleteUpload().then(() => {
                if (error.message === '404')
                    rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
                else rejectResponse(response, 500, 'Internal Server Error', [error.message]);
            })
        );
};
