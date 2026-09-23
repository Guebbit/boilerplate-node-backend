/**
 * @module
 * Controller for `GET /observability/metrics`: the Prometheus scrape endpoint. Answers the
 * exposition format text, or a valid empty one on a collection failure — never an error page, since
 * a scraper logs a format error on top of the outage the moment the body fails to parse.
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
    void getPrometheusMetrics()
        .then((metrics) => {
            response.setHeader('Content-Type', metricsRegistry.contentType);
            response.send(metrics);
        })
        .catch((error: unknown) => {
            // Stryker disable next-line all
            logger.error('Failed to collect Prometheus metrics', { error });
            response.status(500).send('# metrics unavailable\n');
        });
};
