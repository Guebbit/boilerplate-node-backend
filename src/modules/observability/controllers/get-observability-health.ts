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

    successResponse(response, {
        status: overallStatus(dependencies),
        environment: process.env.NODE_ENV ?? 'development',
        service: process.env.NODE_SERVICE_NAME ?? 'boilerplate-node-backend',
        nodeVersion: process.version,
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
            /* Frontend observability: self-hosted Umami analytics + Grafana Faro collector. */
            umami: Boolean(process.env.NODE_UMAMI_HOST),
            faro: Boolean(process.env.NODE_FARO_COLLECTOR_URL),
            /*
             * The name of the provider serving `emitAnalyticsEvent`, not a boolean: which backend
             * receives product events is a deployment choice between three, and `posthog: false`
             * could not distinguish "PostHog is unconfigured" from "this deployment uses Umami" or
             * "it collects nothing on purpose".
             */
            analytics: resolveAnalyticsProvider().name
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
