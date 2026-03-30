import type {Request, Response} from "express";

/**
 * Homepage
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    res.status(200)
        .json({
            success: true,
            message: 'Home sweet home'
        });
}