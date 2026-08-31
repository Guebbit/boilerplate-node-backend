/**
 * @module
 * Controller for `GET /observability/health`. Assembles the readiness snapshot by hand, off
 * `infrastructure/observability`: dependency state, telemetry sinks, process resources. See the
 * JSDoc on `getObservabilityHealth` below for what each field means and why liveness lives
 * elsewhere.
 *
 * See: docs/modules/observability.md
 */

import type { Request, Response } from 'express';
import os from 'node:os';
import { successResponse } from '@infrastructure/http/response';
import { resolveAnalyticsProvider } from '@infrastructure/observability/analytics';
import { dependencyHealth, overallStatus } from '@infrastructure/observability/dependency-health';
import { processSnapshot } from '@infrastructure/observability/process-snapshot';

/**
 * GET /observability/health
 *
 * The READINESS answer: can this instance serve what it promises, and if not, which part is
 * missing. Liveness — is the process alive at all — is `GET /`, and it is what the container
 * HEALTHCHECK probes; the two are deliberately different endpoints, because an orchestrator
 * restarts on liveness and restarting this process would not bring a downed Redis back.
 *
 * `status` folds every backing service, so a deployment with Mongo up and Redis down reports
 * `degraded` rather than `ok`. `telemetry` sits apart from `dependencies` and is NOT part of that
 * fold: those are sinks this service writes to, and losing one costs visibility rather than
 * capability — an unreachable Loki does not make a checkout fail. They are also configuration
 * flags rather than probes, which is what the separate name says out loud.
 */
export const getObservabilityHealth = (_request: Request, response: Response) => {
    const snapshot = processSnapshot();
    const dependencies = dependencyHealth();
    const analyticsProvider = resolveAnalyticsProvider();

    successResponse(response, {
        status: overallStatus(dependencies),
        environment: process.env.NODE_ENV ?? 'development',
        service: process.env.NODE_SERVICE_NAME ?? 'boilerplate-node-backend',
        runtimeVersion: process.version,
        uptimeSeconds: snapshot.uptimeSeconds,
        /*
         * One vocabulary for three unlike services, so the payload reads without a legend. Objects
         * rather than bare strings: a per-dependency latency or last-error is the obvious next
         * field, and this way adding one is additive.
         */
        dependencies: {
            database: { status: dependencies.database },
            cache: { status: dependencies.cache },
            queue: { status: dependencies.queue }
        },
        /*
         * Which telemetry sinks this deployment is wired to. Booleans read off the environment,
         * never reachability — the previous name, `integrations`, read like a health check and was
         * the reason this block kept being mistaken for one.
         */
        telemetry: {
            loki: Boolean(process.env.NODE_LOKI_HOST),
            otel: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
            /*
             * Frontend observability: the origin a browser loads the Umami tracking script from,
             * plus the Faro collector. Declarative, and NOT the backend's own analytics wiring —
             * that is `analytics` below, which needs a website id this origin says nothing about.
             */
            umami: Boolean(process.env.NODE_UMAMI_HOST),
            faro: Boolean(process.env.NODE_FARO_COLLECTOR_URL),
            /*
             * Which backend receives product events, and whether it can actually deliver them.
             *
             * The name is a deployment choice between three, so `posthog: false` could not
             * distinguish "PostHog is unconfigured" from "this deployment uses Umami". `configured`
             * is the half that was missing: a provider selected without its credentials warns once
             * and then discards every event for the life of the process, and this endpoint —
             * whose job is "which part is missing" — reported a name and looked healthy.
             */
            analytics: {
                provider: analyticsProvider.name,
                configured: analyticsProvider.configured()
            }
        },
        /*
         * Bytes, not megabytes, and the same four fields the SSE stream publishes — so a dashboard
         * showing this card beside the live feed is comparing numbers rather than doing unit
         * arithmetic to find out whether they agree.
         */
        memory: snapshot.memory,
        system: {
            platform: os.platform(),
            cpuCount: os.cpus().length,
            loadAvg: os.loadavg()
        },
        timestamp: new Date().toISOString()
    });
};
