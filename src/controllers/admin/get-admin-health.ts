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
        },
        system: {
            platform: os.platform(),
            cpuCount: os.cpus().length,
            loadAvg: os.loadavg()
        },
        timestamp: new Date().toISOString()
    };

    successResponse(response, data);
};
