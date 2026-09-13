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
import { toProduct } from '@modules/products';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/adapters/image-store';
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
    const { id, price, active, requiresShipping, categories, tags, translations } = readInput(
        request,
        {
            surface: 'write',
            ids: ['id'],
            booleans: ['active', 'requiresShipping'],
            numbers: ['price'],
            stringArrays: ['categories', 'tags'],
            jsonFields: ['translations']
        }
    );

    const {
        imageUrl = '',
        thumbnailUrl,
        pendingImageKey,
        deleteUpload
    } = readUploadedImage(request);

    if (!id) {
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return deleteUpload();
    }

    return productService
        .writeUpdate(
            id,
            {
                ...request.body,
                price,
                active,
                requiresShipping,
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
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.errors);
                });
            if (!result.data)
                return deleteUpload().then(() => {
                    rejectResponse(response, 500, [t('generic.error-internal')]);
                });
            successResponse<Product>(response, toProduct(result.data));
        })
        .catch((error: Error) =>
            deleteUpload().then(() => {
                rejectDatabaseError(response, 'updateProduct', error);
            })
        );
};
