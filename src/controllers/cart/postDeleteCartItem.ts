import type { Request, Response } from "express";

export default (req: Request, res: Response) => {
    if (!req.user)
        return res.status(500).redirect('/errors/500-unknown');

    req.user.Cart
        .getProducts(
            {
                where: {
                    id: req.body.id
                }
            }
        )
        .then(([product]) => product.CartItems.destroy())
        .then(() => res.redirect('/cart'));
};