import type { Request, Response, NextFunction } from 'express';
import type { CastError } from 'mongoose';
import { databaseErrorConverter } from '@utils/helpers-errors';
import { userService } from '@services/users';

/**
 * Get cart of user to display the order data (and proceed to checkout)
 *
 * @param request
 * @param response
 * @param next
 */
export const pageCheckout = (request: Request, response: Response, next: NextFunction) =>
    // check done before entering the route
    userService.cartGet(request.user!)
        .then((productList) => {
            response.render('misc/checkout', {
                pageMetaTitle: 'Checkout',
                pageMetaLinks: ['/css/cart.css'],
                productList
            });
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
