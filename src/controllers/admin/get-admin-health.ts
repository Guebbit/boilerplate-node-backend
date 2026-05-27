import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import os from 'os';
import { successResponse } from '@utils/response';

/* Map mongoose readyState integer to the spec enum values. */
const dbStatusMap: Record<number, 'connected' | 'connecting' | 'disconnected'> = {
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
    const dbReadyState = mongoose.connection.readyState;
    const dbStatus = dbStatusMap[dbReadyState] ?? 'disconnected';
    const overallStatus = dbStatus === 'connected' ? 'ok' : 'degraded';

    successResponse(response, {
        status: overallStatus,
        environment: process.env.NODE_ENV ?? 'development',
        service: process.env.NODE_SERVICE_NAME ?? 'boilerplate-node-backend',
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        database: { status: dbStatus },
        integrations: {
            loki: Boolean(process.env.NODE_LOKI_HOST),
            posthog: Boolean(process.env.NODE_POSTHOG_API_KEY),
            otelEnabled: process.env.OTEL_ENABLED === 'true'
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

export default getAdminHealth;
