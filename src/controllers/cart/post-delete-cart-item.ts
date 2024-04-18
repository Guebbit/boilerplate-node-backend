import type { Request, Response, NextFunction } from "express";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostDeleteCartItemPostData {
    id: string,
}

/**
 * Delete target cart item
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request<unknown, unknown, IPostDeleteCartItemPostData>, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartItemRemove(req.body.id)
        .then(() => res.redirect('/cart'))
        .catch(({ message }: Error) => next(new ExtendedError("500", 500, message, false)))