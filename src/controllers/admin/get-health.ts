import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import os from 'node:os';
import { successResponse } from '@utils/response';
import { isLokiEnabled } from '@utils/winston';
import { isPostHogEnabled } from '@utils/analytics';

/** Returns a comprehensive JSON health snapshot for the admin dashboard. */
export const getAdminHealth = (_request: Request, response: Response): void => {
    const { readyState } = mongoose.connection;
    const databaseStatus =
        readyState === 1 ? 'connected' : readyState === 2 ? 'connecting' : 'disconnected';

    const memUsage = process.memoryUsage();

    successResponse(
        response,
        {
            status: 'ok',
            environment: process.env.NODE_ENV ?? 'development',
            service: process.env.NODE_SERVICE_NAME ?? 'api',
            nodeVersion: process.version,
            uptimeSeconds: Math.floor(process.uptime()),
            database: { status: databaseStatus },
            integrations: {
                loki: isLokiEnabled(),
                posthog: isPostHogEnabled(),
                otelEnabled: Boolean(process.env.NODE_OTEL_ENABLED !== '0')
            },
            memory: {
                heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
                rssMb: Math.round(memUsage.rss / 1024 / 1024)
            },
            system: {
                platform: os.platform(),
                cpuCount: os.cpus().length,
                loadAvg: os.loadavg()
            },
            timestamp: new Date().toISOString()
        },
        200,
        'Health check'
    );
};
