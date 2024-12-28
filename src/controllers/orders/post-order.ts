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
        .then(({ success }) => {
            if(!success)
                return next(new ExtendedError("500", 500, false, [t('ecommerce.order-creation-failure')]))
            req.flash('success', [t('ecommerce.order-creation-success')]);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            nodemailer({
                    to: req.user!.email,
                    subject: 'Order confirmed',
                },
                "email-order-confirm.ejs",
                {
                    ...res.locals,
                    pageMetaTitle: 'Order confirmed',
                    pageMetaLinks: [],
                    name: req.user!.username
                });
        })
        .catch(({ message }: Error) => next(new ExtendedError("500", 500, false, [message])))
        .finally(() => res.redirect('/orders'))
