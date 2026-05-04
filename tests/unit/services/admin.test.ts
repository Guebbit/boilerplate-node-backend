import mongoose from 'mongoose';
import { adminService } from '@services/admin';
import { AuditAction, getRecentAuditEvents } from '@utils/audit';
import { metricsRegistry } from '@utils/observability';

jest.mock('@utils/audit', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    ...jest.requireActual('@utils/audit'),
    getRecentAuditEvents: jest.fn()
}));

jest.mock('@utils/observability', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    metricsRegistry: {
        getMetricsAsJSON: jest.fn()
    }
}));

const mockedGetRecentAuditEvents = getRecentAuditEvents as jest.MockedFunction<
    typeof getRecentAuditEvents
>;
const mockedGetMetricsAsJSON = metricsRegistry.getMetricsAsJSON as jest.MockedFunction<
    typeof metricsRegistry.getMetricsAsJSON
>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('adminService.getHealthSummary', () => {
    it('returns a health payload compatible with admin dashboard cards', () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalServiceName = process.env.NODE_SERVICE_NAME;
        const originalOtelEnabled = process.env.NODE_OTEL_ENABLED;

        process.env.NODE_ENV = 'test';
        process.env.NODE_SERVICE_NAME = 'api';
        process.env.NODE_OTEL_ENABLED = '1';

        const health = adminService.getHealthSummary();

        expect(health.status).toBe('ok');
        expect(health.environment).toBe('test');
        expect(health.service).toBe('api');
        expect(health.nodeVersion).toBeTruthy();
        expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
        expect(['connected', 'connecting', 'disconnected']).toContain(health.database.status);
        expect(typeof health.integrations.otelEnabled).toBe('boolean');
        expect(health.memory.heapUsedMb).toBeGreaterThanOrEqual(0);
        expect(health.system.cpuCount).toBeGreaterThan(0);
        expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);

        process.env.NODE_ENV = originalNodeEnv;
        process.env.NODE_SERVICE_NAME = originalServiceName;
        process.env.NODE_OTEL_ENABLED = originalOtelEnabled;
    });

    it('maps mongoose readyState to disconnected when not connected/connecting', () => {
        jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({
            readyState: 0
        } as mongoose.Connection);

        const health = adminService.getHealthSummary();
        expect(health.database.status).toBe('disconnected');
    });
});

describe('adminService.getMetricsSummary', () => {
    it('aggregates metrics into dashboard summary format', async () => {
        mockedGetMetricsAsJSON.mockResolvedValue([
            {
                name: 'http_requests_total',
                values: [{ labels: { route: '/orders', method: 'GET' }, value: 100 }]
            },
            {
                name: 'http_request_errors_total',
                values: [{ labels: { route: '/orders', method: 'GET' }, value: 5 }]
            },
            {
                name: 'http_requests_in_flight',
                values: [{ labels: {}, value: 2 }]
            },
            {
                name: 'process_uptime_seconds',
                values: [{ labels: {}, value: 3600 }]
            },
            {
                name: 'nodejs_heap_size_used_bytes',
                values: [{ labels: {}, value: 52 * 1024 * 1024 }]
            },
            {
                name: 'http_request_duration_milliseconds_bucket',
                values: [
                    { labels: { le: '50' }, value: 60 },
                    { labels: { le: '200' }, value: 95 },
                    { labels: { le: '+Inf' }, value: 100 }
                ]
            },
            {
                name: 'http_request_duration_milliseconds_count',
                values: [{ labels: {}, value: 100 }]
            },
            {
                name: 'auth_login_total',
                values: [
                    { labels: { status: 'success' }, value: 70 },
                    { labels: { status: 'failure' }, value: 10 }
                ]
            },
            {
                name: 'auth_signup_total',
                values: [{ labels: { status: 'success' }, value: 20 }]
            },
            {
                name: 'cart_checkout_total',
                values: [{ labels: { status: 'success' }, value: 12 }]
            },
            {
                name: 'order_created_total',
                values: [{ labels: {}, value: 12 }]
            },
            {
                name: 'db_query_total',
                values: [
                    { labels: { collection: 'users', operation: 'find' }, value: 10 },
                    { labels: { collection: 'orders', operation: 'save' }, value: 20 }
                ]
            },
            {
                name: 'db_errors_total',
                values: [{ labels: { collection: 'orders', operation: 'save' }, value: 1 }]
            }
        ] as never);

        const summary = await adminService.getMetricsSummary();

        expect(summary.http.totalRequests).toBe(100);
        expect(summary.http.totalErrors).toBe(5);
        expect(summary.http.errorRate).toBe(0.05);
        expect(summary.http.inFlight).toBe(2);
        expect(summary.http.latencyMs.p50).toBe(50);
        expect(summary.http.latencyMs.p95).toBe(200);
        expect(summary.auth.loginSuccess).toBe(70);
        expect(summary.auth.loginFailure).toBe(10);
        expect(summary.business.ordersCreated).toBe(12);
        expect(summary.database.queriesTotal).toBe(30);
        expect(summary.database.errorsTotal).toBe(1);
        expect(summary.process.heapUsedMb).toBe(52);
    });
});

describe('adminService.getAuditLogs', () => {
    it('delegates filtering to getRecentAuditEvents and returns total', () => {
        mockedGetRecentAuditEvents.mockReturnValue([
            {
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                action: AuditAction.AUTH_LOGIN_FAILED,
                outcome: 'failure',
                timestamp: '2026-01-01T00:00:00.000Z',
                level: 'warn'
            }
        ]);

        const result = adminService.getAuditLogs({
            actor: 'anonymous',
            action: 'auth.login.failed',
            outcome: 'failure',
            since: '2026-01-01T00:00:00.000Z',
            limit: 50
        });

        expect(mockedGetRecentAuditEvents).toHaveBeenCalledWith({
            actor: 'anonymous',
            action: 'auth.login.failed',
            outcome: 'failure',
            since: '2026-01-01T00:00:00.000Z',
            limit: 50
        });
        expect(result.total).toBe(1);
        expect(result.items[0]?.action).toBe('auth.login.failed');
    });
});
