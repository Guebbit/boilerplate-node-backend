import type { Request, Response } from 'express';
import { getExecTime } from '@guebbit/js-toolkit';
import { logger } from '@utils/winston';
import { successResponse } from '@utils/response';

/**
 * GET /observability/load-test
 * Busy-loops the event loop while emitting log lines, so dashboards and log
 * pipelines can be exercised under synthetic CPU load. Dev/staging only.
 */
export const getObservabilityLoadTest = (_request: Request, response: Response) =>
    getExecTime(() => {
        const totalLoad = 20_000;
        let progressLoad = 0;
        for (let i = 0; i < totalLoad; i++) {
            progressLoad++;
            logger.info(
                `Worker ${process.pid} at ${Math.round((progressLoad / totalLoad) * 100)}% of task`
            );
        }
    }).then(({ time }) =>
        successResponse(
            response,
            { durationMs: time },
            200,
            `The CPU intensive task required ${time}ms`
        )
    );

export default getObservabilityLoadTest;
