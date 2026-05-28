<<<<<<< HEAD
import os from 'node:os';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import { successResponse } from '@utils/response';

/*
 * GET /admin/health
 * Full JSON health snapshot: uptime, database, memory, system info.
 */
export const getAdminHealth = (_request: Request, response: Response): void => {
    const DB_STATES: Record<number, 'connected' | 'connecting' | 'disconnected'> = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnected'
    };
    const dbState = DB_STATES[mongoose.connection.readyState] ?? 'disconnected';

    const mem = process.memoryUsage();
    const toMb = (bytes: number) => Math.round(bytes / 1024 / 1024);

    const data = {
        status: dbState === 'connected' ? 'ok' : ('degraded' as const),
        environment: process.env.NODE_ENV ?? 'unknown',
        service: process.env.NODE_SERVICE_NAME ?? 'api',
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        database: { status: dbState },
        integrations: {
            loki: Boolean(process.env.NODE_LOKI_HOST),
            posthog: Boolean(process.env.NODE_POSTHOG_API_KEY),
            otelEnabled: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
        },
        memory: {
            heapUsedMb: toMb(mem.heapUsed),
            heapTotalMb: toMb(mem.heapTotal),
            rssMb: toMb(mem.rss)
=======
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import os from 'node:os';
import { successResponse } from '@utils/response';

/* Map mongoose readyState integer to the spec enum values. */
const databaseStatusMap: Record<number, 'connected' | 'connecting' | 'disconnected'> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnected'
};

/**
 * GET /admin/health
 * Full JSON health snapshot for the admin dashboard.
 */
export const getAdminHealth = (_request: Request, response: Response) => {
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
            otelEnabled: process.env.OTEL_ENABLED === 'true'
        },
        memory: {
            heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
            heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
            rssMb: Math.round(mem.rss / 1_048_576)
>>>>>>> origin/main
        },
        system: {
            platform: os.platform(),
            cpuCount: os.cpus().length,
            loadAvg: os.loadavg()
        },
        timestamp: new Date().toISOString()
<<<<<<< HEAD
    };

    successResponse(response, data);
};
=======
    });
};

export default getAdminHealth;
>>>>>>> origin/main
