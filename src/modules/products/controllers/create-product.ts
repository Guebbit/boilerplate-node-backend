/**
 * @module
 * Admin create controller for the catalogue — decodes the upload and the body, then hands both to
 * `productService.writeCreate`, which writes the product together with every
 * language it was created in, in one operation.
 */

import type { Request, Response } from 'express';
import { productService } from '../services';
import { rejectResponse, createdResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { parseBody } from '@infrastructure/http/controller';
import { readInput, callerContextOf } from '@infrastructure/http/request';
import { claimUpload, readUploadedImage } from '@infrastructure/http/uploads';
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
        requiresShipping,
        noWithdrawal,
        onHand,
        weight,
        categories,
        tags,
        translations
    } = readInput(request, {
        surface: 'create',
        booleans: ['active', 'purchasable', 'requiresShipping', 'noWithdrawal'],
        numbers: ['price', 'onHand', 'weight'],
        stringArrays: ['categories', 'tags'],
        jsonFields: ['translations']
    });

    // No `= ''` default: `''` is invalid input (`ImageUrl`'s own `minLength: 1`) — `undefined` is what "no image" means to `zodProductCreateSchema`'s
    // `.optional()` field.
    const { imageUrl, thumbnailUrl, pendingImageKey } = readUploadedImage(request);

    const body = parseBody(
        productService.zodProductCreateSchema,
        {
            ...request.body,
            price,
            active,
            purchasable,
            requiresShipping,
            noWithdrawal,
            onHand,
            weight,
            categories,
            tags,
            translations
        },
        response
    );
    // `parseBody` has already answered 422: the close hook deletes the upload.
    if (!body) return;

    return productService
        .writeCreate(
            body,
            callerContextOf(request),
            // Server-decided, so it never rides in the body the schema validates.
            { imageUrl, thumbnailUrl, pendingImageKey }
        )
        .then((result) => {
            // A refusal is left unclaimed: the upload middleware's close hook deletes the upload
            // once the 4xx/5xx has gone out.
            if (!result.success) {
                rejectResponse(response, result.status, result.errors);
                return;
            }
            claimUpload(request);
            const product = productService.toProduct(result.data, request.caller);
            createdResponse<Product>(response, product, `/products/${product.id}`);
        })
        .catch((error: unknown) => {
            rejectDatabaseError(response, 'createProduct', error);
        });
};
