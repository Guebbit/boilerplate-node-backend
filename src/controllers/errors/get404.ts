import type { Request, Response } from "express";

export default (req: Request, res: Response) => {
    res
        .status(404)
        .render('errors/404-page', {
            pageTitle: 'Page Not Found'
        });
};
