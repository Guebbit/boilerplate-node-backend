import type { Request, Response } from "express";

export default (req: Request, res: Response) => {
    const title = req.flash("error-title").join(". ") || "Unknown error";
    const description = req.flash("error-description").join(". ") || "Unknown error";
    res
        .status(404)
        .render("errors/404-page", {
            pageMetaTitle: title,
            pageMetaLinks: [],
            title,
            description,
        });
}