/**
 * `registerWorkers`: which consumers a worker binds for its role, and that it drains the held jobs
 * for the same role.
 *
 * `worker` and `worker-heavy` run the same image; this is the only place the role takes effect.
 */
import { setEnvironment } from '@tests/environment';

/** The queues a consumer was bound to, in order. */
const bound: string[] = [];

/** The queue adapter, with a recording consumer binding. */
jest.mock('@infrastructure/adapters/queue', () => ({
    EMAIL_URGENT_QUEUE: 'worker.email.urgent',
    isQueueEnabled: () => true,
    consumeFromQueue: ({ queue }: { queue: string }) => {
        bound.push(queue);
        return Promise.resolve();
    }
}));

/** Stands in for the held-job drain; the cases assert which role it was started for. */
const startJobDrain = jest.fn();

jest.mock('@infrastructure/adapters/job-drain', () => ({
    startJobDrain: (...arguments_: unknown[]) => startJobDrain(...arguments_)
}));
jest.mock('@infrastructure/adapters/email.worker', () => ({
    EMAIL_QUEUE: 'worker.email.send',
    handleEmailJob: jest.fn()
}));
jest.mock('@infrastructure/adapters/image.worker', () => ({
    IMAGE_QUEUE: 'worker.image.digest',
    handleImageDigestJob: jest.fn(),
    registerImageWritebackResolver: jest.fn()
}));
// The modules' own consumers: one per kind.
jest.mock('../../../src/modules', () => ({
    enabledModules: [
        {
            name: 'webhooks',
            consumers: [
                {
                    queue: 'worker.webhook.deliver',
                    handler: jest.fn(),
                    schema: { parse: jest.fn() }
                }
            ]
        },
        {
            name: 'account',
            consumers: [
                {
                    queue: 'worker.account.export',
                    handler: jest.fn(),
                    schema: { parse: jest.fn() }
                }
            ]
        }
    ]
}));

import { registerWorkers } from '@app/workers';

beforeEach(() => {
    bound.length = 0;
    startJobDrain.mockClear();
});

describe('registerWorkers', () => {
    it('binds mail, urgent mail and webhook deliveries for the standard role', async () => {
        setEnvironment({ NODE_WORKER_ROLE: 'standard' });

        await registerWorkers();

        expect(bound.toSorted()).toEqual([
            'worker.email.send',
            'worker.email.urgent',
            'worker.webhook.deliver'
        ]);
    });

    it('binds image digests and exports, and nothing else, for the heavy role', async () => {
        setEnvironment({ NODE_WORKER_ROLE: 'heavy' });

        await registerWorkers();

        expect(bound.toSorted()).toEqual(['worker.account.export', 'worker.image.digest']);
    });

    it.each(['standard', 'heavy'] as const)(
        'drains the held jobs for the %s role, after the consumers are bound',
        async (role) => {
            setEnvironment({ NODE_WORKER_ROLE: role });

            await registerWorkers();

            expect(startJobDrain).toHaveBeenCalledTimes(1);
            expect(startJobDrain.mock.calls[0]?.[1]).toBe(role);
        }
    );
});
