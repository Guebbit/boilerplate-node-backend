import type { Request, Response } from "express";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    _id: string,
}

/**
 * Delete target cart item
 *
 * @param req
 * @param res
 */
export default (req: Request<unknown, unknown, IPostDeleteCartItemPostData>, res: Response) =>
    // check done before entering the route
    req.user!.cartItemRemove(req.body._id)
        .then(() => res.redirect('/cart'));