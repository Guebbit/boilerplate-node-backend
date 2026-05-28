import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { resolveImageUrl } from '@utils/helpers-uploads';
import { deleteFile } from '@utils/helpers-filesystem';
import { extractStringList } from '@utils/helpers-request';
import type {
    CreateProductRequest,
    CreateProductRequestMultipart,
    UpdateProductRequest,
    UpdateProductRequestMultipart,
    UpdateProductByIdRequest,
    UpdateProductByIdRequestMultipart
} from '@types';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

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
    const { imageUrlRaw, imageUrl: imageUrlFile } = resolveImageUrl(request as Request);
    const imageUrl = imageUrlFile ?? request.body.imageUrl ?? '';
    const categories = extractStringList((request.body as { categories?: unknown }).categories);
    const tags = extractStringList((request.body as { tags?: unknown }).tags);
    // If problem arises: remove the uploaded file (that can be missing so nothing happen)
    const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));

    /**
     * Validation errors prevent creation end editing
     */
    const errors = productService.validateData({
        ...request.body,
        imageUrl,
        active: !!request.body.active,
        categories,
        tags
    });
    if (errors.length > 0)
        return deleteUpload().then(() => {
            rejectResponse(response, 422, 'writeProduct - validation failed', errors);
        });

    /**
     * NO ID = new product
     */
    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, 'updateProduct - missing id', [
                t('generic.error-missing-data')
            ]);
            return deleteUpload();
        }

        return productService
            .create({
                ...request.body,
                imageUrl,
                active: !!request.body.active,
                categories,
                tags
            })
            .then((product) => {
                emitAuditEvent({
                    action: AuditAction.ADMIN_PRODUCT_CREATED,
                    actor_user_id: request.authContext?.id ?? 'unknown',
                    actor_role: 'admin',
                    outcome: 'success',
                    target_type: 'product',
                    target_id: String(product._id),
                    ...extractRequestContext(request)
                });
                successResponse(response, product.toObject(), 201);
            })
            .catch((error: Error) =>
                deleteUpload().then(() => {
                    rejectResponse(response, 500, 'Internal Server Error', [error.message]);
                })
            );
    }

    /**
     * ID = edit product
     */
    return productService
        .updateById(id, {
            ...request.body,
            imageUrl,
            active: !!request.body.active,
            categories,
            tags
        })
        .then((product) => {
            emitAuditEvent({
                action: AuditAction.ADMIN_PRODUCT_UPDATED,
                actor_user_id: request.authContext?.id ?? 'unknown',
                actor_role: 'admin',
                outcome: 'success',
                target_type: 'product',
                target_id: id,
                ...extractRequestContext(request)
            });
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
