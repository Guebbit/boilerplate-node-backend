import type { Request, Response } from "express";

export default (req: Request, res: Response) =>
    // check done before entering the route
    req.user!.cartRemove(req.body._id)
        .then(() => res.redirect('/cart'));