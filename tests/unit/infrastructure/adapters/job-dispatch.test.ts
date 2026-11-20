/**
 * `dispatchJob`: where a job goes when the broker answers, is down, or is not configured at all.
 *
 * The three answers decide whether a producer runs the work itself: a wrong `inline` puts an image
 * decode back on a request thread during an outage, a wrong `held` loses a job nobody will drain.
 */

/** Stands in for the broker publish; a case sets what it answers. */
const publishToQueueMock = jest.fn();

/** Stands in for the configured check; a case sets it. */
const isQueueEnabledMock = jest.fn();

/** The queue adapter, reduced to those two. */
jest.mock('@infrastructure/adapters/queue', () => ({
    publishToQueue: (options: unknown) => publishToQueueMock(options),
    isQueueEnabled: () => isQueueEnabledMock()
}));

/** Stands in for the fallback store. */
const holdJobMock = jest.fn();

/** The store, reduced to its write. */
jest.mock('@infrastructure/persistence/job-store', () => ({
    holdJob: (channel: string, payload: unknown) => holdJobMock(channel, payload)
}));

/** The logger, so a case can assert what was logged. */
const loggerMock = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

/** Getter, not a property: see `mailer-dispatch.test.ts` for why the factory must not read the const early. */
jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    get logger() {
        return loggerMock;
    }
}));

import { dispatchJob } from '@infrastructure/adapters/job-dispatch';

/** One job, whatever it carries. */
const JOB = { queue: 'worker.email.send', payload: { to: 'a@example.com' } };

beforeEach(() => {
    jest.clearAllMocks();
    holdJobMock.mockResolvedValue(undefined);
});

describe('dispatchJob', () => {
    it('answers published, and holds nothing, once the broker confirms', async () => {
        publishToQueueMock.mockResolvedValue(true);

        await expect(dispatchJob(JOB)).resolves.toBe('published');

        expect(holdJobMock).not.toHaveBeenCalled();
    });

    it('holds the job under its own channel when the broker is configured but down', async () => {
        publishToQueueMock.mockResolvedValue(false);
        isQueueEnabledMock.mockReturnValue(true);

        await expect(dispatchJob(JOB)).resolves.toBe('held');

        expect(holdJobMock).toHaveBeenCalledWith('worker.email.send', { to: 'a@example.com' });
    });

    it('answers inline, and holds nothing, when no broker is configured', async () => {
        publishToQueueMock.mockResolvedValue(false);
        isQueueEnabledMock.mockReturnValue(false);

        await expect(dispatchJob(JOB)).resolves.toBe('inline');

        expect(holdJobMock).not.toHaveBeenCalled();
    });

    it('falls back to inline, and logs, when even the fallback store refuses the job', async () => {
        publishToQueueMock.mockResolvedValue(false);
        isQueueEnabledMock.mockReturnValue(true);
        holdJobMock.mockRejectedValue(new Error('mongo down'));

        await expect(dispatchJob(JOB)).resolves.toBe('inline');

        expect(loggerMock.error).toHaveBeenCalledWith(
            expect.objectContaining({ queue: 'worker.email.send' })
        );
    });
});
