import type { Request, Response } from "express";
import { t } from "i18next";
import nodemailer from "../../utils/nodemailer";

/**
 * Create a new order
 * using the current user cart,
 * then empty the cart
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    req.user!.orderConfirm()
        .then((order) => {
            // TODO
            if(!order)
                return;
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
        .catch(({message}: Error) => req.flash('error', [message]))
        .finally(() => res.redirect('/orders'))
