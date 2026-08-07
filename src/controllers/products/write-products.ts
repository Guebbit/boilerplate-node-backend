import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@core/i18n';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@core/http/response';
import { readInput } from '@core/http/request';
import { resolveImageUrl } from '@core/http/uploads';
import { imageStore } from '@core/adapters/image-store';
import type {
    CreateProductRequest,
    CreateProductRequestMultipart,
    UpdateProductRequest,
    UpdateProductRequestMultipart,
    UpdateProductByIdRequest,
    UpdateProductByIdRequestMultipart,
    Product
} from '@types';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';

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
        ParamsDictionary,
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
    // One declaration instead of a per-field assembly — see docs/theory/request-input.md.
    // `booleans`/`stringArrays` are the fields whose type a multipart body cannot carry.
    const { id, active, categories, tags } = readInput(request, {
        sources: ['params', 'body'],
        ids: ['id'],
        booleans: ['active'],
        stringArrays: ['categories', 'tags']
    });

    /**
     * Uploaded file takes priority over body imageUrl
     */
    const imageUrlFile = resolveImageUrl(request);
    const imageUrl = imageUrlFile ?? (request.body as { imageUrl?: string }).imageUrl ?? '';
    // If problem arises: remove the image THIS request uploaded — `imageUrlFile`, deliberately,
    // and not the merged `imageUrl`: a body-supplied url names an image this request did not
    // create, and deleting it because validation failed would destroy someone else's file.
    const deleteUpload = () => imageStore.remove(imageUrlFile);

    /**
     * Validation errors prevent creation end editing
     */
    const errors = productService.validateData({
        ...request.body,
        imageUrl,
        active,
        categories,
        tags
    });
    if (errors.length > 0)
        return deleteUpload().then(() => {
            rejectResponse(response, 422, 'writeProduct - validation failed', errors);
        });

    // Past the guard above, these have been checked against zodProductSchema — the assertion
    // records what the validator just established rather than assuming it.
    const validated = { imageUrl, active, categories, tags } as Pick<
        Product,
        'imageUrl' | 'active' | 'categories' | 'tags'
    >;

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
                ...validated
            })
            .then((product) => {
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.ADMIN_PRODUCT_CREATED,
                        outcome: 'success',
                        target_type: 'product',
                        target_id: String(product._id)
                    })
                );
                successResponse(response, product, 201);
            })
            .catch((error: Error) =>
                deleteUpload().then(() => {
                    rejectResponse(response, 500, 'createProduct', [error.message]);
                })
            );
    }

    /**
     * ID = edit product
     */
    return productService
        .updateById(id, {
            ...request.body,
            ...validated
        })
        .then((product) => {
            emitAuditEvent(
                buildAuditEvent(request, {
                    action: AuditAction.ADMIN_PRODUCT_UPDATED,
                    outcome: 'success',
                    target_type: 'product',
                    target_id: id
                })
            );
            successResponse(response, product);
        })
        .catch((error: Error) =>
            deleteUpload().then(() => {
                if (error.message === '404')
                    rejectResponse(response, 404, 'updateProduct - not found', [
                        t('ecommerce.product-not-found')
                    ]);
                else rejectResponse(response, 500, 'updateProduct', [error.message]);
            })
        );
};
