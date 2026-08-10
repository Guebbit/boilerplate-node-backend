import type { Request, Response } from 'express';
import { t } from '@core/i18n';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@core/http/response';
import { rejectDatabaseError } from '@core/http/errors';
import type { CastError } from 'mongoose';
import {
    emitAnalyticsEvent,
    analyticsEvents,
    buildAnalyticsBase
} from '@core/observability/analytics';

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
                rejectResponse(response, 404, [t('ecommerce.product-not-found')]);
                return;
            }
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: analyticsEvents.PRODUCT_VIEWED,
                properties: { product_id: String(request.params.id) }
            });
            successResponse(response, product);
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('ecommerce.product-not-found')]);
            rejectDatabaseError(response, 'getProductItem', error);
        });
