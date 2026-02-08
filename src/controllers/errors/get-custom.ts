import type { Request, Response } from "express";

export const getCustomError = (request: Request, response: Response) => {
    const title = request.flash("error-title").join(". ");
    const description = request.flash("error-description").join(". ");
    response
        .status(500)
        .render('errors/custom', {
            pageMetaTitle: title,
            pageMetaLinks: [],
            title,
            description,
        });
}