import type { Request, Response, NextFunction } from 'express';
import { CastError } from 'mongoose';
import { databaseErrorConverter } from '@utils/helpers-errors';
import { userService } from '@services/users';
import { t } from 'i18next';
import type { RemoveCartItemRequest } from '@types';

/**
 * Delete target cart item
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteCartItem = (
    request: Request<{ productId?: string }, unknown, RemoveCartItemRequest>,
    response: Response,
    next: NextFunction
) => {
    // Authentication check is done before entering the route
    const user = request.user!;
    const productId = String(request.params.productId ?? request.body.productId);

    const existing = user.cart.items.find((i) => i.product.equals(productId));
    if (!existing) throw new Error(t('ecommerce.product-not-found'));

    // check done before entering the route
    return userService.cartItemRemoveById(request.user!, productId)
        .then(({ success }) => {
            if (!success) throw new Error(t('ecommerce.product-not-found'));
            request.flash('success', [t('ecommerce.cart-product-removed')]);
            return response.redirect('/cart');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
};
