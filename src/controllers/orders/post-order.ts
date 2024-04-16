import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import nodemailer from "../../utils/nodemailer";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Create a new order
 * using the current user cart,
 * then empty the cart
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    req.user!.orderConfirm()
        .then((order) => {
            if(!order)
                next(new ExtendedError("500", 500, t('ecommerce.order-creation-failure')))
            req.flash('success', [t('ecommerce.order-creation-success')]);
            nodemailer({
                    to: req.user!.email,
                    subject: 'Order confirmed',
                },
                "emailOrderConfirm.ejs",
                {
                    ...res.locals,
                    pageMetaTitle: 'Order confirmed',
                    pageMetaLinks: [],
                    name: req.user!.username
                });
        })
        .catch(({ message }: Error) => next(new ExtendedError("500", 500, message, false)))
        .finally(() => res.redirect('/orders'))
