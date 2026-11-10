/**
 * @module
 * Controller for `GET /observability/metrics`: the Prometheus scrape endpoint. Answers the
 * exposition text; on a collection failure, a 500 in the same type. Prometheus marks a non-200
 * scrape failed (`up` = 0) from the status alone and never reads its body; the type keeps the
 * answer true to the contract.
 *
 * See: docs/modules/observability.md
 */

import type { Request, Response } from 'express';
import {
    getPrometheusMetrics,
    metricsRegistry
} from '@infrastructure/observability/metrics-registry';
import { logger } from '@infrastructure/adapters/logger';

/** GET /observability/metrics — scraped by Prometheus, guarded by a static credential. */
export const getObservabilityMetrics = (_request: Request, response: Response) => {
    // Set before the chain so the success and the 500 answer share one type.
    response.setHeader('Content-Type', metricsRegistry.contentType);

    void getPrometheusMetrics()
        .then((metrics) => {
            response.send(metrics);
        })
        .catch((error: unknown) => {
            // Stryker disable next-line all
            logger.error('Failed to collect Prometheus metrics', { error });
            response.status(500).send('# metrics unavailable\n');
        });
};
