import type { Request, Response } from 'express';
import { t } from 'i18next';
import { productService } from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /products/:id
 * Get a single product by path id.
 * Only admin can see non-active (inactive/deleted) products.
 */
export const getProductItem = (request: Request, response: Response) => {
    // Admin can search inactive or deleted products; non-admin sees only active ones
    const admin = request.user?.admin === true;
    return productService.getById(String(request.params.id), admin).then((product) => {
        if (!product) {
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }
        successResponse(response, product);
    });
};
