/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminHealthResponse } from '../models/AdminHealthResponse';
import type { AdminMetricsSummaryResponse } from '../models/AdminMetricsSummaryResponse';
import type { AuditLogsResponse } from '../models/AuditLogsResponse';
import type { MessageResponse } from '../models/MessageResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminService {
    /**
     * API health check
     * Returns a simple liveness indicator. Use `GET /admin/health` for the full admin health summary.
     * @returns MessageResponse API is running
     * @throws ApiError
     */
    public static getHealth(): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/',
        });
    }
    /**
     * Prometheus metrics
     * Raw Prometheus text (exposition format 0.0.4).
     * Intended for Prometheus scraping, not for browser clients.
     * Use `GET /admin/metrics/summary` for a JSON summary suitable for dashboards.
     *
     * @returns string Prometheus exposition text
     * @throws ApiError
     */
    public static getPrometheusMetrics(): CancelablePromise<string> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/metrics',
        });
    }
    /**
     * Admin health summary
     * Full JSON health snapshot for the admin dashboard.
     * Includes uptime, database status, memory, integrations, and system info.
     * Requires admin role.
     *
     * @returns AdminHealthResponse Health summary
     * @throws ApiError
     */
    public static getAdminHealth(): CancelablePromise<AdminHealthResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/health',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Metrics summary (JSON)
     * Key operational metrics derived from Prometheus counters/histograms,
     * returned as structured JSON for dashboard KPI cards and charts.
     * Requires admin role.
     *
     * @returns AdminMetricsSummaryResponse Metrics summary
     * @throws ApiError
     */
    public static getAdminMetricsSummary(): CancelablePromise<AdminMetricsSummaryResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/metrics/summary',
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
     * @returns AuditLogsResponse Audit events
     * @throws ApiError
     */
    public static getAdminAuditLogs(
        actor?: string,
        action?: string,
        outcome?: 'success' | 'failure',
        since?: string,
        limit: number = 50,
    ): CancelablePromise<AuditLogsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/audit',
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
