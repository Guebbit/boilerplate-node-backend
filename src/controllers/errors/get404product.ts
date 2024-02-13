import type { Request, Response } from "express";

export default (req: Request, res: Response) => {
    res
        .status(404)
        .render('errors/404-product', {
            pageTitle: 'Product Not Found',
        });
};