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

describe('job_last_success_timestamp_seconds — D9', () => {
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
            'job_last_success_timestamp_seconds{job="reap:orders"} 1767225600'
        );
        expect(metrics).not.toContain('job="reap:quarantine"');
    });

    it('resolves the whole scrape, rather than rejecting, when the query itself fails', async () => {
        withReadyState(1);
        mockedListLeaseSummaries.mockRejectedValue(new Error('connection reset'));

        const metrics = await getPrometheusMetrics();

        expect(metrics).toContain('# HELP process_uptime_seconds');
        expect(metrics).not.toMatch(/^job_last_success_timestamp_seconds{/m);
    });
});
