/**
 * `jobHealth` — the job half of `GET /observability/health`.
 *
 * One mapping, and the whole of it is a WIRE-SHAPE guarantee: `leases` stores `lastSuccessAt` as a
 * `Date`, and `ObservabilityHealth.jobs` declares an ISO-8601 string, like every other timestamp
 * that endpoint reports. A `Date` reaching the response serialises to the same characters through
 * `JSON.stringify`, so the mistake this catches is not visible in a passing contract test — it is
 * visible the moment something reads the field without going through JSON.
 *
 * `listLeaseSummaries` is mocked: what it reads out of Mongo belongs to the lease suite, and this
 * file is about what happens to the shape afterwards.
 */
const listLeaseSummariesMock = jest.fn();
jest.mock('@infrastructure/persistence/lease', () => ({
    listLeaseSummaries: () => listLeaseSummariesMock()
}));

import { jobHealth } from '../../job-health';

describe('jobHealth', () => {
    it('reports a completed job as an ISO-8601 string, not a Date', async () => {
        listLeaseSummariesMock.mockResolvedValue([
            { name: 'reap:orders', lastSuccessAt: new Date('2026-09-13T02:15:00.000Z') }
        ]);

        const [job] = await jobHealth();

        expect(job).toEqual({
            name: 'reap:orders',
            lastSuccessAt: '2026-09-13T02:15:00.000Z',
            lastError: undefined
        });
    });

    it('carries the last error through untouched', async () => {
        listLeaseSummariesMock.mockResolvedValue([
            {
                name: 'reap:carts',
                lastSuccessAt: new Date('2026-09-12T03:00:00.000Z'),
                lastError: 'ECONNREFUSED'
            }
        ]);

        await expect(jobHealth()).resolves.toEqual([
            {
                name: 'reap:carts',
                lastSuccessAt: '2026-09-12T03:00:00.000Z',
                lastError: 'ECONNREFUSED'
            }
        ]);
    });

    it('leaves a job that has never succeeded without a timestamp, rather than inventing one', async () => {
        // The field is optional in the contract precisely for this: a job registered but never
        // run has no last success, and `new Date(undefined)` would report the epoch as fact.
        listLeaseSummariesMock.mockResolvedValue([{ name: 'reap:leases' }]);

        const [job] = await jobHealth();

        expect(job.lastSuccessAt).toBeUndefined();
    });

    it('answers with an empty list when no job has ever taken a lease', async () => {
        listLeaseSummariesMock.mockResolvedValue([]);

        await expect(jobHealth()).resolves.toEqual([]);
    });
});
