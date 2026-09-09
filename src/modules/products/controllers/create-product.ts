/**
 * @module
 * Admin create controller for the catalogue — decodes the upload and the body, then hands both to
 * `productService.writeCreate`, which validates and writes the product together with every
 * language it was created in, in one operation.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { productService } from '../service';
import { toProduct } from '@modules/products';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { t } from '@infrastructure/i18n';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/adapters/image-store';
import type { CreateProductRequest, CreateProductRequestMultipart, Product } from '@types';

/**
 * POST /products — admin create. `translations` arrives as a JSON object on a `application/json`
 * body, or a JSON-ENCODED STRING on a multipart one — a multipart part carries no nested objects,
 * only strings, so `jsonFields` decodes it the same way `numbers`/`stringArrays` decode their own
 * string-transported fields.
 */
export const createProduct = (
    request: Request<
        ParamsDictionary,
        unknown,
        CreateProductRequest | CreateProductRequestMultipart
    >,
    response: Response
) => {
    const { price, active, onHand, categories, tags, translations } = readInput(request, {
        surface: 'create',
        booleans: ['active'],
        numbers: ['price', 'onHand'],
        stringArrays: ['categories', 'tags'],
        jsonFields: ['translations']
    });

    // `= ''` because an absent image is an empty url here — see `zodProductCreateSchema`.
    const {
        imageUrl = '',
        thumbnailUrl,
        pendingImageKey,
        deleteUpload
    } = readUploadedImage(request);

    return productService
        .writeCreate(
            { ...request.body, price, active, onHand, categories, tags, translations, imageUrl },
            callerContextOf(request),
            { thumbnailUrl, pendingImageKey }
        )
        .then((result) => {
            if (!result.success)
                return deleteUpload().then(() => {
                    rejectResponse(response, result.status, result.errors);
                });
            // `ResponseSuccess.data` is optional at the type level for endpoints with no payload;
            // `writeCreate` always resolves one on success, so this is exhaustiveness.
            if (!result.data)
                return deleteUpload().then(() => {
                    rejectResponse(response, 500, [t('generic.error-internal')]);
                });
            successResponse<Product>(response, toProduct(result.data), 201);
        })
        .catch((error: Error) =>
            deleteUpload().then(() => {
                rejectDatabaseError(response, 'createProduct', error);
            })
        );
};
