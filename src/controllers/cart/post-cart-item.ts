import type { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';
import ProductRepository from '@repositories/products';
import type { CastError } from 'mongoose';
import { databaseErrorConverter } from '@utils/helpers-errors';
import type { UpsertCartItemRequest } from '@types';
import UserService from '@services/users';

/**
 * Add a product (with its quantity) to cart, check availability, etc
 * Create a CartItem row.
 *
 * @param request
 * @param response
 * @param next
 */
export const postCartItem = (
    request: Request<{ productId?: string }, unknown, UpsertCartItemRequest>,
    response: Response,
    next: NextFunction
) => {
    const user = request.user!;
    const productId = String(request.params.productId ?? request.body.productId);

    if (!request.body.quantity || request.body.quantity < 1) {
        request.flash('error', [ t('generic.error-invalid-data') ]);
        return Promise.resolve();
    }

    UserService.cartItemSetById(user, productId, request.body.quantity)
        .then(() => {
            request.flash('success', [ t('ecommerce.product-added-to-cart') ]);
            return response.redirect('/cart');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
}
