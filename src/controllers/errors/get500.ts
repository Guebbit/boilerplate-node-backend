import type { Request, Response } from "express";

export default (req: Request, res: Response) =>
    res.render('errors/500-unknown', {
            pageMetaTitle: 'Unknown error',
            pageMetaLinks: [],
        });