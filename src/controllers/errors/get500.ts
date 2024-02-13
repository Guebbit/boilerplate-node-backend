import type { Request, Response } from "express";

export default (req: Request, res: Response) => {
    res
        .status(500)
        .render('errors/500-unknown', {
            pageTitle: 'Unknown error',
        });
};