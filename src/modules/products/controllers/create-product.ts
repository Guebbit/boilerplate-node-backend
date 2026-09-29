/**
 * @module
 * Admin create controller for the catalogue — decodes the upload and the body, then hands both to
 * `productService.writeCreate`, which validates and writes the product together with every
 * language it was created in, in one operation.
 */

import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { productService } from '../service';
import { rejectResponse, createdResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { readUploadedImage } from '@infrastructure/http/uploads';
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
    const {
        price,
        active,
        requiresShipping,
        noWithdrawal,
        onHand,
        weight,
        categories,
        tags,
        translations
    } = readInput(request, {
        surface: 'create',
        booleans: ['active', 'requiresShipping', 'noWithdrawal'],
        numbers: ['price', 'onHand', 'weight'],
        stringArrays: ['categories', 'tags'],
        jsonFields: ['translations']
    });

    // No `= ''` default: `''` is invalid input (`ImageUrl`'s own `minLength: 1`) — `undefined` is what "no image" means to `zodProductCreateSchema`'s
    // `.optional()` field.
    const { imageUrl, thumbnailUrl, pendingImageKey, deleteUpload } = readUploadedImage(request);

    return productService
        .writeCreate(
            {
                ...request.body,
                price,
                active,
                requiresShipping,
                noWithdrawal,
                onHand,
                weight,
                categories,
                tags,
                translations
            },
            callerContextOf(request),
            // Server-decided, so it never rides in the body the schema validates.
            { imageUrl, thumbnailUrl, pendingImageKey }
        )
        .then((result) => {
            if (!result.success)
                return deleteUpload()
                    .catch(() => undefined)
                    .then(() => {
                        rejectResponse(response, result.status, result.errors);
                    });
            const product = productService.toProduct(result.data);
            createdResponse<Product>(response, product, `/products/${product.id}`);
        })
        .catch((error: unknown) =>
            deleteUpload()
                .catch(() => undefined)
                .then(() => {
                    rejectDatabaseError(response, 'createProduct', error);
                })
        );
};
