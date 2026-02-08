import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { nodemailer } from "../../utils/nodemailer";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Create a new order
 * using the current user cart,
 * then empty the cart
 *
 * @param request
 * @param response
 * @param next
 */
export const postOrder = (request: Request, response: Response, next: NextFunction) =>
    request.user!.orderConfirm()
        .then(({ success }) => {
            if(!success)
                return next(new ExtendedError("500", 500, false, [t('ecommerce.order-creation-failure')]))
            request.flash('success', [t('ecommerce.order-creation-success')]);

            nodemailer({
                    to: request.user!.email,
                    subject: 'Order confirmed',
                },
                "email-order-confirm.ejs",
                {
                    ...response.locals,
                    pageMetaTitle: 'Order confirmed',
                    pageMetaLinks: [],
                    name: request.user!.username
                });
        })
        .catch(({ message }: Error) => next(new ExtendedError("500", 500, false, [message])))
        .finally(() => response.redirect('/orders'))
