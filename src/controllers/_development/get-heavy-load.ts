import type { Request, Response } from 'express';
import { getExecTime } from '@utils/get-exec-time';
import { logger } from '@utils/winston';

/**
 * GET /heavy-load
 * Heavy load test endpoint.
 */
export const getHeavyLoad = (request: Request, response: Response) =>
    getExecTime(() => {
        const totalLoad = 20_000;
        let progressLoad = 0;
        for (let i = 0; i < totalLoad; i++) {
            progressLoad++;
            logger.info(
                `Worker ${process.pid} at ${Math.round((progressLoad / totalLoad) * 100)}% of task`
            );
        }
    }).then(({ time }) => {
        response.status(200).json({
            success: true,
            message: `The CPU intensive task required ${time}ms \n`
        });
    });
