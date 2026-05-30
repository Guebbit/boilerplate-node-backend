/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminHealthResponseEnvelope } from '../models/AdminHealthResponseEnvelope';
import type { AdminMetricsSummaryResponseEnvelope } from '../models/AdminMetricsSummaryResponseEnvelope';
import type { AuditLogsResponseEnvelope } from '../models/AuditLogsResponseEnvelope';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ObservabilityService {
    /**
     * Observability SSE stream
     * Live Server-Sent Events stream for demo dashboards.
     * Sends `metrics.snapshot` on connect, followed by periodic `metrics.updated` and `heartbeat` events.
     *
     * @returns string Server-Sent Events stream
     * @throws ApiError
     */
    public static getObservabilityEvents(): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/observability/events',
        });
    }
    /**
     * Health snapshot
     * Full JSON health snapshot for dashboard use.
     * Includes uptime, database status, memory, integrations, and system info.
     * Requires admin role.
     *
     * @returns AdminHealthResponseEnvelope Health summary
     * @throws ApiError
     */
    public static getObservabilityHealth(): CancelablePromise<AdminHealthResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/observability/health',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Prometheus metrics
     * Raw Prometheus text (exposition format 0.0.4).
     * Intended for Prometheus scraping, not for browser clients.
     * Use `GET /observability/metrics/overview` for a JSON summary suitable for dashboards.
     *
     * @returns string Prometheus exposition text
     * @throws ApiError
     */
    public static getObservabilityMetrics(): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/observability/metrics',
        });
    }
    /**
     * Metrics overview (JSON)
     * Key operational metrics derived from Prometheus counters/histograms,
     * returned as structured JSON for dashboard KPI cards and charts.
     * Requires admin role.
     *
     * @returns AdminMetricsSummaryResponseEnvelope Metrics overview
     * @throws ApiError
     */
    public static getObservabilityMetricsOverview(): CancelablePromise<AdminMetricsSummaryResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/observability/metrics/overview',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Recent audit events
     * Returns the most recent audit events from the in-memory ring buffer (up to 200).
     * Events include auth flows, admin CRUD actions, and security blocks.
     * Requires admin role.
     *
     * @param actor Filter by actor user ID
     * @param action Filter by action name (e.g. auth.login.failed)
     * @param outcome Filter by outcome
     * @param since Return events after this ISO-8601 timestamp
     * @param limit Maximum number of events to return
     * @returns AuditLogsResponseEnvelope Audit events
     * @throws ApiError
     */
    public static getObservabilityAuditLogs(
        actor?: string,
        action?: string,
        outcome?: 'success' | 'failure',
        since?: string,
        limit: number = 50,
    ): CancelablePromise<AuditLogsResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/observability/audit',
            query: {
                'actor': actor,
                'action': action,
                'outcome': outcome,
                'since': since,
                'limit': limit,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
}
