import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
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
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, Number.parseInt(error.message), false)))