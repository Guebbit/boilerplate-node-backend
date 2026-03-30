import type { Request, Response } from "express";

export const getNotFound = (request: Request, response: Response) => {
    const title = request.flash("error-title").join(". ");
    const description = request.flash("error-description").join(". ");
    response
        .status(404)
        .render("errors/404-page", {
            pageMetaTitle: title,
            pageMetaLinks: [],
            title,
            description,
        });
}