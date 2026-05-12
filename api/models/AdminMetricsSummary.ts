/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminMetricsLatency } from './AdminMetricsLatency';
export type AdminMetricsSummary = {
    http: {
        totalRequests: number;
        totalErrors: number;
        /**
         * Fraction of requests that returned 4xx/5xx
         */
        errorRate: number;
        inFlight: number;
        latencyMs: AdminMetricsLatency;
    };
    auth: {
        loginSuccess?: number;
        loginFailure?: number;
        signupSuccess?: number;
    };
    business: {
        checkoutSuccess?: number;
        ordersCreated?: number;
    };
    database: {
        queriesTotal?: number;
        errorsTotal?: number;
    };
    process: {
        uptimeSeconds?: number;
        heapUsedMb?: number;
    };
    timestamp: string;
};

