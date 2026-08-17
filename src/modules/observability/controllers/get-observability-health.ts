import type { Request, Response } from 'express';
import os from 'node:os';
import { connection } from '@infrastructure/runtime/database';
import { successResponse } from '@infrastructure/http/response';
import { resolveAnalyticsProvider } from '@infrastructure/observability/analytics';
import { processSnapshot } from '@infrastructure/observability/process-snapshot';

/*
 * Map mongoose readyState integer to the spec enum values.
 * readyState 3 = 'disconnecting' in Mongoose, but the OpenAPI spec only
 * allows connected/connecting/disconnected, so we map it to 'disconnected'.
 */
const databaseStatusMap: Record<number, 'connected' | 'connecting' | 'disconnected'> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnected' /* disconnecting → treated as disconnected per spec */
};

/**
 * GET /observability/health
 * Full JSON health snapshot for dashboard use.
 */
export const getObservabilityHealth = (_request: Request, response: Response) => {
    const snapshot = processSnapshot();
    const databaseReadyState = connection.readyState;
    const databaseStatus = databaseStatusMap[databaseReadyState] ?? 'disconnected';
    const overallStatus = databaseStatus === 'connected' ? 'ok' : 'degraded';

    successResponse(response, {
        status: overallStatus,
        environment: process.env.NODE_ENV ?? 'development',
        service: process.env.NODE_SERVICE_NAME ?? 'boilerplate-node-backend',
        nodeVersion: process.version,
        uptimeSeconds: snapshot.uptimeSeconds,
        database: { status: databaseStatus },
        integrations: {
            loki: Boolean(process.env.NODE_LOKI_HOST),
            /*
             * The name of the provider serving `emitAnalyticsEvent`, not a boolean: which
             * backend receives product events is a deployment choice between three, and
             * `posthog: false` could not distinguish "PostHog is unconfigured" from "this
             * deployment uses Umami" or "it collects nothing on purpose".
             */
            analytics: resolveAnalyticsProvider().name,
            otelEnabled: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
            /* Frontend observability: self-hosted Umami analytics + Grafana Faro collector. */
            umami: Boolean(process.env.NODE_UMAMI_HOST),
            faro: Boolean(process.env.NODE_FARO_COLLECTOR_URL)
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

export default getObservabilityHealth;
