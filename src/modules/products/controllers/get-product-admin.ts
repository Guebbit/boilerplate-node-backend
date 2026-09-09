/**
 * @module
 * Admin read controller — every language a product has, for the editor's form to populate its
 * tabs. Not `createItemController`: that factory names its handler `get<Entity>Item`, which does
 * not fit this operation's own name, but the CastError-to-404 handling below matches it exactly.
 * A `CastError` on `id` reads as 404 rather than the 422 `databaseErrorInterpreter` would
 * otherwise answer — the same choice `get-product-item.ts` makes, for the same reason: a
 * malformed id and an unknown one look identical from outside. `rejectDatabaseError`'s own 422
 * still applies to anything else the interpreter recognises, e.g. a `BSONError` — which is why
 * the contract still declares it.
 */

import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { productService } from '../service';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { ProductAdmin } from '@types';

/** GET /products/:id/admin — a product with every language it has a row for. */
export const getProductAdmin = (request: Request, response: Response) =>
    productService
        .getAdmin(String(request.params.id))
        .then((product) => {
            if (!product) {
                rejectResponse(response, 404, [t('products.not-found')]);
                return;
            }
            successResponse<ProductAdmin>(response, product);
        })
        .catch((error: CastError) => {
            // A malformed id reaches Mongoose as a CastError rather than a miss — the same 404 a
            // well-formed unknown id gets, since this route offers no 422 to fall back on.
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('products.not-found')]);
            rejectDatabaseError(response, 'getProductAdmin', error);
        });
