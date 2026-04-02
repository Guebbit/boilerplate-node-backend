import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';

export const getProductItem = (request: Request, response: Response) =>
    productService
        .getById(String(request.params.id), request.user?.admin === true)
        .then((product) => {
            if (!product) {
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
                return;
            }
            successResponse(response, product);
        })
        .catch((error: Error) => {
            if (error.message == '404')
                rejectResponse(response, 404, 'getProduct - not found', [
                    t('ecommerce.product-not-found')
                ]);
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
