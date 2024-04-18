import type { Request, Response, NextFunction } from "express";
import { ExtendedError } from "../../utils/error-helpers";


/**
 * Remove ALL items in the user cart
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request, res: Response, next: NextFunction) =>
    // check done before entering the route
    req.user!.cartRemove()
        .then(() => res.redirect('/cart'))
        .catch(({ message }: Error) => next(new ExtendedError("500", 500, message, false)))