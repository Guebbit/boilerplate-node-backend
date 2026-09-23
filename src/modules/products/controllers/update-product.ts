/**
 * @module
 * Admin update controller for the catalogue — decodes the upload and the body, then hands both to
 * `productService.writeUpdate`, which validates and MERGES the product's fields and its
 * translation rows in one operation. See the `PATCH /products/{id}` operation description for the
 * merge semantics.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { t } from '@infrastructure/i18n';
import { productService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/http/uploads';
import type { UpdateProductRequest, UpdateProductRequestMultipart, Product } from '@types';

/**
 * PATCH /products/:id — admin update. A multipart `translations` field carries a JSON-encoded
 * `ProductTranslationsWrite` string rather than a nested object — a multipart part has no way to
 * send an object except as a string — so `jsonFields` decodes it before validation.
 */
export const updateProduct = (
    request: Request<
        ParamsDictionary,
        unknown,
        UpdateProductRequest | UpdateProductRequestMultipart
    >,
    response: Response
) => {
    const { id, price, active, requiresShipping, weight, categories, tags, translations } =
        readInput(request, {
            surface: 'write',
            ids: ['id'],
            booleans: ['active', 'requiresShipping'],
            numbers: ['price', 'weight'],
            stringArrays: ['categories', 'tags'],
            jsonFields: ['translations']
        });

    const {
        imageUrl = '',
        thumbnailUrl,
        pendingImageKey,
        deleteUpload
    } = readUploadedImage(request);

    if (!id) {
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        // The response is already sent — a rejected cleanup must not become an unhandled
        // promise rejection on top of it.
        return deleteUpload().catch(() => undefined);
    }

    return productService
        .writeUpdate(
            id,
            {
                ...request.body,
                price,
                active,
                requiresShipping,
                weight,
                categories,
                tags,
                translations,
                imageUrl
            },
            callerContextOf(request),
            { thumbnailUrl, pendingImageKey }
        )
        .then((result) => {
            if (!result.success)
                return deleteUpload()
                    .catch(() => undefined)
                    .then(() => {
                        rejectResponse(response, result.status, result.errors);
                    });
            successResponse<Product>(response, productService.toProduct(result.data));
        })
        .catch((error: unknown) =>
            deleteUpload()
                .catch(() => undefined)
                .then(() => {
                    rejectDatabaseError(response, 'updateProduct', error);
                })
        );
};
