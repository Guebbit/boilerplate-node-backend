/**
 * `queueHealth` — the queue half of `GET /observability/health`.
 *
 * A thin pass-through of `parkedCounts()`, unlike `jobHealth`'s Date-to-string mapping: the wire
 * shape `ObservabilityHealth.queues` declares is exactly what `parkedCounts` already returns.
 * `parkedCounts` itself — the channel it opens, the broker calls it makes — is proven in
 * `tests/unit/infrastructure/adapters/queue.test.ts`; this file is only about the wiring.
 */
const parkedCountsMock = jest.fn();
jest.mock('@infrastructure/adapters/queue', () => ({
    parkedCounts: () => parkedCountsMock()
}));

import { queueHealth } from '../../services/parked-jobs';

describe('queueHealth', () => {
    it('reports every queue parkedCounts answers with, unchanged', async () => {
        parkedCountsMock.mockResolvedValue([
            { name: 'worker.email.send', parked: 2 },
            { name: 'worker.image.digest', parked: 0 }
        ]);

        await expect(queueHealth()).resolves.toEqual([
            { name: 'worker.email.send', parked: 2 },
            { name: 'worker.image.digest', parked: 0 }
        ]);
    });

    it('answers empty when parkedCounts reaches no queue at all', async () => {
        parkedCountsMock.mockResolvedValue([]);

        await expect(queueHealth()).resolves.toEqual([]);
    });
});
