import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import os from 'node:os';
import { successResponse } from '@utils/response';

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
    const mem = process.memoryUsage();
    const databaseReadyState = mongoose.connection.readyState;
    const databaseStatus = databaseStatusMap[databaseReadyState] ?? 'disconnected';
    const overallStatus = databaseStatus === 'connected' ? 'ok' : 'degraded';

    successResponse(response, {
        status: overallStatus,
        environment: process.env.NODE_ENV ?? 'development',
        service: process.env.NODE_SERVICE_NAME ?? 'boilerplate-node-backend',
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        database: { status: databaseStatus },
        integrations: {
            loki: Boolean(process.env.NODE_LOKI_HOST),
            posthog: Boolean(process.env.NODE_POSTHOG_API_KEY),
            otelEnabled: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
            /* Frontend observability: self-hosted Umami analytics + Grafana Faro collector. */
            umami: Boolean(process.env.NODE_UMAMI_HOST),
            faro: Boolean(process.env.NODE_FARO_COLLECTOR_URL)
        },
        memory: {
            heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
            heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
            rssMb: Math.round(mem.rss / 1_048_576)
        },
        system: {
            platform: os.platform(),
            cpuCount: os.cpus().length,
            loadAvg: os.loadavg()
        },
        timestamp: new Date().toISOString()
    });
};

export default getObservabilityHealth;
