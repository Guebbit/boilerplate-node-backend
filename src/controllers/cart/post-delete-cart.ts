import type { Request, Response } from "express";

/**
 * Remove ALL items in the user cart
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    // check done before entering the route
    req.user!.cartRemove()
        .then(() => res.redirect('/cart'));