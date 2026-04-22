import { Controller, Get, Header } from '@nestjs/common';
import { ok, fail } from '@nest/utils/http';
import { getPrometheusMetrics } from '@utils/observability';
import { getExecTime } from '@utils/get-exec-time';
import { logger } from '@utils/winston';

/**
 * System and health endpoints.
 */
@Controller()
export class SystemController {
    /**
     * GET /
     */
    @Get('/')
    root() {
        return ok({ status: 'ok' }, 200, 'API is running');
    }

    /**
     * GET /metrics
     */
    @Get('/metrics')
    @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    metrics() {
        return getPrometheusMetrics();
    }

    /**
     * GET /heavy
     * Development-only CPU test endpoint.
     */
    @Get('/heavy')
    heavy() {
        if (process.env.NODE_ENV === 'production') fail(404, 'Not Found');

        return getExecTime(() => {
            const totalLoad = 20_000;
            let progressLoad = 0;
            for (let i = 0; i < totalLoad; i++) {
                progressLoad++;
                logger.info(
                    `Worker ${process.pid} at ${Math.round((progressLoad / totalLoad) * 100)}% of task`
                );
            }
        }).then(({ time }) => ({
            success: true,
            message: `The CPU intensive task required ${time}ms \n`
        }));
    }
}
