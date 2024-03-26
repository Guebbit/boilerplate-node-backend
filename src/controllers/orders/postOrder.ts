import type { Request, Response } from "express";
import { t } from "i18next";

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
        .then(() => req.flash('success', [t('ecommerce.order-creation-success')]))
        .catch(({message}: Error) => req.flash('error', [message]))
        .finally(() => res.redirect('/orders'))