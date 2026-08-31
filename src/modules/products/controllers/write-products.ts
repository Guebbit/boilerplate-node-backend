/**
 * @module
 * Admin create/update controller for the catalogue. One handler for POST/PUT because the two
 * bodies overlap almost entirely — presence of an id is what tells create from update apart — and
 * both must run the same validation, image bookkeeping, and upload cleanup on failure.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@infrastructure/i18n';
import { productService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/adapters/image-store';
import type {
    CreateProductRequest,
    CreateProductRequestMultipart,
    UpdateProductRequest,
    UpdateProductRequestMultipart,
    UpdateProductByIdRequest,
    UpdateProductByIdRequestMultipart,
    Product
} from '@types';

/**
 * POST/PUT /products, and PUT /products/:id — admin create/update.
 * Whichever path supplies an id determines create vs update; PUT without one returns 422.
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
    // `price` is declared for the same reason `active` is: the image-carrying variants of these
    // routes send a multipart body, which has no types, so both arrive as strings and
    // `zodProductSchema` rejects them.
    const { id, active, price, onHand, categories, tags } = readInput(request, {
        surface: 'write',
        ids: ['id'],
        booleans: ['active'],
        numbers: ['price', 'onHand'],
        stringArrays: ['categories', 'tags']
    });

    // `= ''` because `zodProductSchema` wants a string: an absent image is an empty url here.
    const {
        imageUrl = '',
        thumbnailUrl,
        pendingImageKey,
        deleteUpload
    } = readUploadedImage(request);

    /**
     * Validation errors prevent creation end editing
     */
    const errors = productService.validateData({
        ...request.body,
        imageUrl,
        active,
        price,
        onHand,
        categories,
        tags
    });
    if (errors.length > 0)
        return (
            deleteUpload()
                // The answer does not depend on the cleanup succeeding. Without this catch, a
                // storage backend having a bad moment turns a plain 422 into a 500 — and the
                // client is told the server broke when what it sent was simply invalid.
                .catch(() => undefined)
                .then(() => {
                    rejectResponse(response, 422, errors);
                })
        );

    // Past the guard above, these were already checked against zodProductSchema — the assertion
    // records that rather than assuming it. `thumbnailUrl` and `pendingImageKey` are
    // server-derived, never client-supplied; `thumbnailUrl` lives on `Product` (readOnly),
    // `pendingImageKey` doesn't, so it joins via an intersection instead.
    const validated = {
        imageUrl,
        active,
        price,
        categories,
        tags,
        thumbnailUrl,
        pendingImageKey
    } as Pick<Product, 'imageUrl' | 'active' | 'price' | 'categories' | 'tags' | 'thumbnailUrl'> & {
        pendingImageKey?: string;
    };

    /*
     * The opening count — create-only, deliberately absent from `validated`, which both paths
     * spread. A new product's `onHand` is the one honest absolute count: nothing prior to race
     * with. On an EDIT the same number would blindly overwrite whatever sales and receipts have
     * done since the form opened, which is why the update contracts carry no counter field at
     * all — changing existing stock goes through `POST /inventory/receipts` or `/adjustments`,
     * both signed and ledgered.
     */
    const openingCount = onHand as Product['onHand'];

    /**
     * NO ID = new product
     */
    if (!id) {
        // PUT without an id is invalid
        if (request.method === 'PUT') {
            rejectResponse(response, 422, [t('generic.error-missing-data')]);
            return deleteUpload();
        }

        return productService
            .create(
                {
                    ...request.body,
                    ...validated,
                    ...(openingCount === undefined ? {} : { onHand: openingCount })
                },
                callerContextOf(request)
            )
            .then((product) => {
                successResponse(response, product, 201);
            })
            .catch((error: Error) =>
                deleteUpload().then(() => {
                    rejectDatabaseError(response, 'createProduct', error);
                })
            );
    }

    /**
     * ID = edit product
     */
    return productService
        .updateById(
            id,
            {
                ...request.body,
                ...validated
            },
            callerContextOf(request)
        )
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.errors);
                });
            successResponse(response, result.data);
        })
        .catch((error: Error) =>
            deleteUpload().then(() => {
                rejectDatabaseError(response, 'writeProduct', error);
            })
        );
};
