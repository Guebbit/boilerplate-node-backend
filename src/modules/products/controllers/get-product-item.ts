import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { productService } from '../service';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { CastError } from 'mongoose';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { productsAnalyticsEvents } from '../analytics';

/**
 * GET /products/:id
 * Get a single product by path id.
 * Only admin can see non-active (inactive/deleted) products.
 */
export const getProductItem = (request: Request, response: Response) =>
    // Which rows this caller may read — `getAuth` on the route is what makes the role readable here.
    productService
        .getById(String(request.params.id), productService.callerScope(request.authContext))
        .then((product) => {
            if (!product) {
                rejectResponse(response, 404, [t('products.not-found')]);
                return;
            }
            emitAnalyticsEvent({
                ...buildAnalyticsBase(request),
                event: productsAnalyticsEvents.PRODUCT_VIEWED,
                properties: { product_id: String(request.params.id) }
            });
            successResponse(response, product);
        })
        .catch((error: CastError) => {
            if (error.kind === 'ObjectId')
                return rejectResponse(response, 404, [t('products.not-found')]);
            rejectDatabaseError(response, 'getProductItem', error);
        });
