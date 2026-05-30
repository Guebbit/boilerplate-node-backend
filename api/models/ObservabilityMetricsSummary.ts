/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ObservabilityMetricsLatency } from './ObservabilityMetricsLatency';
export type ObservabilityMetricsSummary = {
    http: {
        totalRequests: number;
        totalErrors: number;
        /**
         * Fraction of requests that returned 4xx/5xx
         */
        errorRate: number;
        inFlight: number;
        latencyMs: ObservabilityMetricsLatency;
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

