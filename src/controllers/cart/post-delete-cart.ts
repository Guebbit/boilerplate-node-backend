import type { Request, Response, NextFunction } from "express";
import {databaseErrorConverter} from "../../utils/error-helpers";
import type {DatabaseError, ValidationError} from "sequelize";


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
        .then(({success}) => {
            if (!success)
                throw new Error("cartRemove error");
            return res.redirect('/cart');
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))

