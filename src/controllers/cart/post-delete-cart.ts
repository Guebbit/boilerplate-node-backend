import type { Request, Response, NextFunction } from 'express';
import type { CastError } from 'mongoose';
import { databaseErrorConverter } from '@utils/helpers-errors';
import UserService from '@services/users';
import { t } from 'i18next';

/**
 * Remove ALL items in the user cart
 *
 * @param request
 * @param response
 * @param next
 */
export const postDeleteCart = (request: Request, response: Response, next: NextFunction) =>
    // check done before entering the route
    UserService.cartRemove(request.user!)
        .then(({ success }) => {
            if (!success) throw new Error('cartRemove error');
            request.flash('success', [t('ecommerce.cart-emptied')]);
            return response.redirect('/cart');
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
