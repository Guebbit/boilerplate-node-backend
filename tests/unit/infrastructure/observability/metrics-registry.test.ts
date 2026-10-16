import { getPrometheusMetrics } from '@infrastructure/observability/metrics-registry';
import { connection } from '@infrastructure/runtime/database';
import { listLeaseSummaries } from '@infrastructure/persistence/lease';

jest.mock('@infrastructure/persistence/lease', () => ({
    listLeaseSummaries: jest.fn()
}));

const mockedListLeaseSummaries = jest.mocked(listLeaseSummaries);

/** Drive `connection.readyState` without opening a database — same helper as `dependency-health.test.ts`. */
const withReadyState = (state: number) => {
    Object.defineProperty(connection, 'readyState', {
        value: state,
        configurable: true
    });
};

describe('getPrometheusMetrics — standard families', () => {
    it('includes process_uptime_seconds', async () => {
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('# HELP process_uptime_seconds');
    });

    it('includes nodejs_eventloop_lag_seconds (prom-client default)', async () => {
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('nodejs_eventloop_lag_seconds');
    });
});

describe('job_last_success_timestamp_seconds', () => {
    afterEach(() => {
        mockedListLeaseSummaries.mockReset();
    });

    it('skips the query and reports nothing while Mongo is not connected', async () => {
        withReadyState(0);

        const metrics = await getPrometheusMetrics();

        expect(mockedListLeaseSummaries).not.toHaveBeenCalled();
        expect(metrics).not.toMatch(/^job_last_success_timestamp_seconds{/m);
    });

    it('reports one series per job that has succeeded at least once', async () => {
        withReadyState(1);
        mockedListLeaseSummaries.mockResolvedValue([
            { name: 'reap:orders', lastSuccessAt: new Date('2026-01-01T00:00:00.000Z') },
            { name: 'reap:quarantine' } // never succeeded — left unset, not `0`.
        ]);

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain(
            'job_last_success_timestamp_seconds{task="reap:orders"} 1767225600'
        );
        expect(metrics).not.toContain('task="reap:quarantine"');
    });

    it('resolves the whole scrape, rather than rejecting, when the query itself fails', async () => {
        withReadyState(1);
        mockedListLeaseSummaries.mockRejectedValue(new Error('connection reset'));

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain('# HELP process_uptime_seconds');
        expect(metrics).not.toMatch(/^job_last_success_timestamp_seconds{/m);
    });
});

describe('job_last_run_timestamp_seconds', () => {
    afterEach(() => {
        mockedListLeaseSummaries.mockReset();
    });

    it('skips the query and reports nothing while Mongo is not connected', async () => {
        withReadyState(0);

        const metrics = await getPrometheusMetrics();

        expect(mockedListLeaseSummaries).not.toHaveBeenCalled();
        expect(metrics).not.toMatch(/^job_last_run_timestamp_seconds{/m);
    });

    it('reports a job that has run but never succeeded, which the success gauge omits', async () => {
        withReadyState(1);
        mockedListLeaseSummaries.mockResolvedValue([
            {
                name: 'reap:orders',
                lastSuccessAt: new Date('2026-01-01T00:00:00.000Z'),
                lastRunAt: new Date('2026-01-02T00:00:00.000Z')
            },
            { name: 'reap:quarantine', lastRunAt: new Date('2026-01-03T00:00:00.000Z') }
        ]);

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain('job_last_run_timestamp_seconds{task="reap:orders"} 1767312000');
        expect(metrics).toContain(
            'job_last_run_timestamp_seconds{task="reap:quarantine"} 1767398400'
        );
        expect(metrics).not.toContain('job_last_success_timestamp_seconds{task="reap:quarantine"}');
    });

    it('resolves the whole scrape, rather than rejecting, when the query itself fails', async () => {
        withReadyState(1);
        mockedListLeaseSummaries.mockRejectedValue(new Error('connection reset'));

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain('# HELP process_uptime_seconds');
        expect(metrics).not.toMatch(/^job_last_run_timestamp_seconds{/m);
    });
});

describe('labelled alert counters', () => {
    it('start at 0, so an increase() alert sees the first event after a restart', async () => {
        await import('@infrastructure/observability/security-events');
        await import('@modules/account/metrics');
        await import('@modules/payments/metrics');
        await import('@modules/payments/audit');
        await import('@modules/observability/audit');
        withReadyState(0);

        const metrics = await getPrometheusMetrics();

        expect(metrics).toMatch(/^security_events_total\{event="security\.api_key\.revoked"\} 0$/m);
        // A module's own attack action is registered from its `audit.ts`, not named here.
        expect(metrics).toMatch(
            /^security_events_total\{event="security\.payment_webhook\.invalid_signature"\} 0$/m
        );
        expect(metrics).toMatch(
            /^security_events_total\{event="security\.metrics_token\.invalid"\} 0$/m
        );
        expect(metrics).toMatch(/^auth_one_time_token_rejected_total\{flow="email_change"\} 0$/m);
        expect(metrics).toMatch(/^payment_amount_mismatch_total\{field="amount"\} 0$/m);
        expect(metrics).toMatch(/^account_export_failed_total 0$/m);
    });
});
