import type { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';
import { nodemailer } from '@utils/nodemailer';
import { ExtendedError } from '@utils/helpers-errors';
import UserService from '@services/users';
import { UpdateOrderRequest } from '@api/model/updateOrderRequest';

/**
 * Create a new order
 * using the current user cart,
 * then empty the cart
 *
 * @param request
 * @param response
 * @param next
 */
export const postOrder = (
    request: Request<unknown, unknown, UpdateOrderRequest>,
    response: Response,
    next: NextFunction
) =>
    UserService.orderConfirm(request.user!)
        .then(({ success }) => {
            if (!success)
                return next(
                    new ExtendedError('500', 500, false, [t('ecommerce.order-creation-failure')])
                );

            void nodemailer(
                {
                    to: request.user!.email,
                    subject: 'Order confirmed'
                },
                'email-order-confirm.ejs',
                {
                    ...response.locals,
                    pageMetaTitle: 'Order confirmed',
                    pageMetaLinks: [],
                    name: request.user!.username
                }
            );

            request.flash('success', [t('ecommerce.order-creation-success')]);
            return response.redirect('/orders');
        })
        .catch(({ message }: Error) => next(new ExtendedError('500', 500, false, [message])));
