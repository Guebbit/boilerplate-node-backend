/**
 * @module
 * What `observability` serves from the worker process: the Prometheus scrape and nothing else.
 *
 * The scrape handler and its credential guard are the API's own (`routes.ts` mounts the same pair
 * at the same path), so a scraper authenticates against the worker exactly as it does against the
 * API. Two alert counters (`queue_jobs_dead_lettered_total`, `webhook_delivery_attempts_total`)
 * move only in the worker, so without this nothing would read them.
 *
 * @see docs/understand/rabbitmq.md#two-processes-one-image
 */

import { Router } from 'express';
import { isMetricsScraper } from './metrics-scraper';
import { getObservabilityMetrics } from './controllers/get-observability-metrics';

/** `GET /metrics`, behind the scraper's static credential; mounted at `/observability`. */
export const workerRouter = Router();

workerRouter.get('/metrics', isMetricsScraper, getObservabilityMetrics);
