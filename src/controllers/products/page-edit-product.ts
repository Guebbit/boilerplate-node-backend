import type { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';
import { databaseErrorConverter, ExtendedError } from '@utils/helpers-errors';
import type { CastError } from 'mongoose';
import ProductService from '@services/products';

/**
 * Url parameters
 */
export interface IGetEditProductParameters {
    productId?: string;
}

/**
 * Get product insertion page
 * If productId is provided: it's an editing page
 *
 * @param request
 * @param response
 * @param next
 */
export const pageEditProduct = (
    request: Request & {
        params: IGetEditProductParameters;
    },
    response: Response,
    next: NextFunction
) => {
    // Admin context: can see any product for editing (including inactive/deleted)
    ProductService.getById(request.params.productId, true)
        .then((product) => {
            const [title, price, description, active] = request.flash('filled');
            response.render('products/edit', {
                pageMetaTitle: product ? 'Edit product' : 'Add product',
                pageMetaLinks: ['/css/forms.css'],
                // old object (if any)
                product: product ?? {
                    // filled inputs (if any)
                    title,
                    price,
                    description,
                    active
                }
            });
        })
        .catch((error: CastError) => {
            if (error.message == '404' || error.kind === 'ObjectId')
                return next(
                    new ExtendedError('404', 404, true, [t('ecommerce.product-not-found')])
                );
            return next(databaseErrorConverter(error));
        });
};
