import type { NextFunction, Request, Response } from "express";

/**
 *
 * @param seconds
 */
export const setCache = (seconds = 0) => (request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', `public, max-age=${seconds}`);
    next();
};