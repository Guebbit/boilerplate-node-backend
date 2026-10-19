/**
 * @module
 * Admin create controller for the catalogue — decodes the upload and the body, then hands both to
 * `productService.create`, which writes the product together with every
 * language it was created in, in one operation.
 */

import type { Request, Response } from 'express';
import { productService } from '../services';
import { rejectResponse, createdResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { parseBody } from '@infrastructure/http/controller';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { writeWithUploadedImage } from '@infrastructure/http/uploads';
import type { CreateProductRequest, CreateProductRequestMultipart, Product } from '@types';

/**
 * POST /products — admin create. `translations` arrives as a JSON object on a `application/json`
 * body, or a JSON-ENCODED STRING on a multipart one — a multipart part carries no nested objects,
 * only strings, so `jsonFields` decodes it the same way `numbers`/`stringArrays` decode their own
 * string-transported fields.
 */
export const createProduct = (
    request: Request<
        Record<string, string>,
        unknown,
        CreateProductRequest | CreateProductRequestMultipart
    >,
    response: Response
) => {
    const {
        price,
        active,
        purchasable,
        allowBackorder,
        requiresShipping,
        noWithdrawal,
        weight,
        categories,
        tags,
        translations
    } = readInput(request, {
        surface: 'create',
        booleans: ['active', 'purchasable', 'allowBackorder', 'requiresShipping', 'noWithdrawal'],
        numbers: ['price', 'weight'],
        stringArrays: ['categories', 'tags'],
        jsonFields: ['translations']
    });

    const body = parseBody(
        productService.zodProductCreateSchema,
        {
            ...request.body,
            price,
            active,
            purchasable,
            allowBackorder,
            requiresShipping,
            noWithdrawal,
            weight,
            categories,
            tags,
            translations
        },
        response
    );
    // `parseBody` has already answered 422: the close hook deletes the upload.
    if (!body) return;

    // The helper reads the upload's server-decided image fields, so they never ride in the body
    // the schema validated, and claims the upload when the write succeeds.
    return writeWithUploadedImage(request, undefined, (image) =>
        productService.create(body, callerContextOf(request), image)
    )
        .then((result) => {
            // A refusal is left unclaimed: the upload middleware's close hook deletes the upload
            // once the 4xx/5xx has gone out.
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            const product = productService.toProduct(result.data, request.caller);
            createdResponse<Product>(response, product, `/products/${product.id}`);
        })
        .catch((error: unknown) => {
            rejectDatabaseError(response, 'createProduct', error);
        });
};
