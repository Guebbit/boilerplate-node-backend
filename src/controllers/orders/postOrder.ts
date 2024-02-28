import type { Request, Response } from "express";

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
        .then(() => res.redirect('/orders'));