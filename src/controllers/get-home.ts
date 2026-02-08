import type { Request, Response } from "express";

/**
 * Homepage
 *
 * @param request
 * @param response
 */
export const getHome = (request: Request, response: Response) =>
    response.render('home', {
        pageMetaTitle: 'Home',
        pageMetaLinks: [],
    })

