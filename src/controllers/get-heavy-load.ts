import logger from "@utils/winston";
import type { Request, Response } from "express";
import { successResponse } from "@utils/response";


/**
 * Heavy load test
 *
 * @param request
 * @param response
 */
export const getHeavyLoad = (_request: Request, response: Response) => {
    const totalLoad = 20_000;
    let progressLoad = 0;
    for (let i = 0; i < totalLoad; i++) {
        progressLoad++;
        logger.info(`Worker ${ process.pid } at ${ Math.round((progressLoad / totalLoad) * 100) }% of task`)
    }
    return successResponse(response, { result: progressLoad }, 200, 'Heavy load task completed');
};