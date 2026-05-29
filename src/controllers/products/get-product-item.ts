import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { CastError } from 'mongoose';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/**
 * GET /products/:id
 * Get a single product by path id.
 * Only admin can see non-active (inactive/deleted) products.
 */
export const getProductItem = (request: Request, response: Response) =>
    // Admin can search inactive or deleted products; non-admin sees only active ones
    productService
        .getById(String(request.params.id), request.authContext?.admin === true)
        .then((product) => {
            if (!product) {
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
                return;
            }
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: AnalyticsEvent.PRODUCT_VIEWED,
                properties: { product_id: String(request.params.id) }
            });
            successResponse(response, product);
        })
        .catch((error: CastError) => {
            if (error.message === '404' || error.kind === 'ObjectId')
                return rejectResponse(response, 404, 'getProductItem - not found', [
                    t('ecommerce.product-not-found')
                ]);
            rejectResponse(response, 500, 'getProductItem', [error.message]);
        });
